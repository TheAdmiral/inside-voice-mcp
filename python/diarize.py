#!/usr/bin/env python3
"""
Speaker diarization for Inside Voice.

Usage: diarize.py AUDIO_PATH MIN_SPEAKERS MAX_SPEAKERS USE_MPS
USE_MPS is "true" or "false".
Prints one JSON object on stdout. Progress and errors go to stderr.
"""

import sys
import json
import os

# Pyannote merges speakers on long recordings, so longer audio is diarized in pieces this long.
PIECE_SECONDS = 600
MIN_LAST_PIECE_SECONDS = 60
# Voice fingerprints this similar, from different pieces, are treated as the same person.
SAME_SPEAKER_SIMILARITY = 0.6
# Speakers with less speech than this in a piece have unreliable voice fingerprints.
MIN_RELIABLE_SECONDS = 30

def setup_device(use_mps):
    """Choose the PyTorch device, using MPS on Apple Silicon only if allowed"""
    try:
        import torch
        if use_mps and torch.backends.mps.is_available():
            print("Using MPS (Apple Silicon) acceleration", file=sys.stderr)
            return torch.device("mps")
        elif torch.cuda.is_available():
            print("Using CUDA acceleration", file=sys.stderr)
            return torch.device("cuda")
        else:
            print("Using CPU (no acceleration available)", file=sys.stderr)
            return torch.device("cpu")
    except ImportError:
        print("PyTorch not available, falling back to CPU", file=sys.stderr)
        return "cpu"

def allow_pyannote_checkpoint_classes():
    """Let PyTorch's safe loading accept the classes stored in the pyannote checkpoints"""
    import torch
    from pyannote.audio.core.task import Problem, Resolution, Specifications
    from torch.torch_version import TorchVersion

    torch.serialization.add_safe_globals([TorchVersion, Problem, Resolution, Specifications])

class SpeakerGroup:
    """Speakers from different pieces of the audio who are believed to be the same person"""

    def __init__(self, member):
        self.members = [member]

    @property
    def pieces(self):
        return {member["piece"] for member in self.members}

    @property
    def duration(self):
        return sum(member["duration"] for member in self.members)

    def similarity_to(self, embedding):
        centre = sum(member["embedding"] * member["duration"] for member in self.members
                     if member["embedding"] is not None)
        return float(centre @ embedding / (norm(centre) * norm(embedding)))

def norm(vector):
    return float((vector @ vector) ** 0.5)

def most_similar_pair(groups, allow_same_piece):
    """Returns (similarity, first group, second group) for the closest two groups, or None"""
    best = None
    for index, first in enumerate(groups):
        for second in groups[index + 1:]:
            if not allow_same_piece and first.pieces & second.pieces:
                continue

            embedding = sum(member["embedding"] * member["duration"] for member in second.members)
            score = first.similarity_to(embedding)
            if best is None or score > best[0]:
                best = (score, first, second)
    return best

def merge_groups(groups, max_speakers):
    """Merges groups that sound alike, then keeps merging if there are more than max_speakers"""
    while len(groups) > 1:
        # Two speakers kept apart within one piece are different people, unless
        # the only way to respect max_speakers is to treat them as one.
        over_limit = len(groups) > max_speakers
        pair = most_similar_pair(groups, allow_same_piece=False)
        if pair is None and over_limit:
            pair = most_similar_pair(groups, allow_same_piece=True)
        if pair is None or (pair[0] < SAME_SPEAKER_SIMILARITY and not over_limit):
            return

        score, first, second = pair
        first.members.extend(second.members)
        groups.remove(second)

def attach_unreliable_speaker(member, groups):
    """Adds a speaker with too little speech for a dependable voice fingerprint to a group"""
    free_groups = [group for group in groups if member["piece"] not in group.pieces]
    options = free_groups or groups

    if member["embedding"] is None:
        chosen = max(options, key=lambda group: group.duration)
    else:
        chosen = max(options, key=lambda group: group.similarity_to(member["embedding"]))
    chosen.members.append(member)

def link_speakers(members, max_speakers):
    """Returns {(piece, local speaker): recording-wide speaker} for the speakers of every piece"""
    if not members:
        return {}

    longest_first = sorted(members, key=lambda member: -member["duration"])
    with_embedding = [member for member in longest_first if member["embedding"] is not None]
    reliable = [m for m in with_embedding if m["duration"] >= MIN_RELIABLE_SECONDS]
    # Very short or unusual audio can leave nobody reliable, so start from the longest speaker.
    if not reliable:
        reliable = (with_embedding or longest_first)[:1]

    groups = [SpeakerGroup(member) for member in reliable]
    if reliable[0]["embedding"] is not None:
        merge_groups(groups, max_speakers)

    for member in longest_first:
        if not any(member is chosen for chosen in reliable):
            attach_unreliable_speaker(member, groups)

    groups.sort(key=lambda group: -group.duration)
    return {
        (member["piece"], member["speaker"]): f"SPEAKER_{index:02d}"
        for index, group in enumerate(groups)
        for member in group.members
    }

def segments_from(diarization, offset=0.0):
    """Converts a pyannote result to our segment format, adding `offset` seconds to each time"""
    return [
        {
            "start": float(turn.start) + offset,
            "end": float(turn.end) + offset,
            "speaker": str(speaker),
        }
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]

def members_for_piece(diarization, embeddings, segments, piece_index):
    """Describes each speaker found in one piece, so speakers can be matched across pieces"""
    members = []
    for index, speaker in enumerate(diarization.labels()):
        embedding = embeddings[index]
        members.append({
            "piece": piece_index,
            "speaker": str(speaker),
            "duration": sum(s["end"] - s["start"] for s in segments if s["speaker"] == str(speaker)),
            "embedding": embedding if is_usable_embedding(embedding) else None,
        })
    return members

def is_usable_embedding(embedding):
    """Pyannote can return invalid or all-zero fingerprints for speakers with very little speech"""
    import numpy as np

    return bool(np.isfinite(embedding).all() and norm(embedding) > 0)

def plan_pieces(info):
    """Returns where each piece of the audio starts and how long it is"""
    frames_per_piece = PIECE_SECONDS * info.sample_rate
    piece_count, leftover_frames = divmod(info.num_frames, frames_per_piece)
    # A leftover too short to be useful on its own is added to the last piece instead.
    if leftover_frames >= MIN_LAST_PIECE_SECONDS * info.sample_rate:
        piece_count += 1

    return [
        {
            "index": index,
            "first_frame": index * frames_per_piece,
            "num_frames": -1 if index == piece_count - 1 else frames_per_piece,
            "offset": index * PIECE_SECONDS,
        }
        for index in range(piece_count)
    ]

def diarize_piece(pipeline, audio_path, piece, min_speakers, max_speakers):
    """Returns the segments of one piece, and the speakers found in it"""
    import torchaudio

    waveform, sample_rate = torchaudio.load(
        audio_path,
        frame_offset=piece["first_frame"],
        num_frames=piece["num_frames"],
    )
    diarization, embeddings = pipeline(
        {"waveform": waveform, "sample_rate": sample_rate},
        min_speakers=min_speakers,
        max_speakers=max_speakers,
        return_embeddings=True,
    )

    segments = segments_from(diarization, offset=piece["offset"])
    members = members_for_piece(diarization, embeddings, segments, piece["index"])
    return [{**segment, "piece": piece["index"]} for segment in segments], members

def diarize_in_pieces(pipeline, audio_path, info, min_speakers, max_speakers):
    """Diarizes long audio in pieces, which clusters voices far better than one long run"""
    pieces = plan_pieces(info)
    results = []
    for piece in pieces:
        print(f"Diarizing piece {piece['index'] + 1} of {len(pieces)}", file=sys.stderr)
        results.append(diarize_piece(pipeline, audio_path, piece, 1, max_speakers))

    labels = link_speakers([m for _, members in results for m in members], max_speakers)
    speaker_count = max(len(set(labels.values())), min_speakers)

    # Pyannote can merge voices within a piece, so now that the number of
    # speakers is known, run again on any piece that found too few of them.
    for piece in pieces:
        _, members = results[piece["index"]]
        if len(members) < speaker_count:
            print(f"Rechecking piece {piece['index'] + 1} for {speaker_count} speakers", file=sys.stderr)
            results[piece["index"]] = diarize_piece(
                pipeline, audio_path, piece, speaker_count, speaker_count
            )

    labels = link_speakers([m for _, members in results for m in members], max_speakers)
    return [
        {
            "start": segment["start"],
            "end": segment["end"],
            "speaker": labels[(segment["piece"], segment["speaker"])],
        }
        for segments, _ in results
        for segment in segments
    ]

def diarize_with_pyannote(audio_path, min_speakers, max_speakers, use_mps):
    """Run diarization using Pyannote.audio 3.1+"""
    try:
        from pyannote.audio import Pipeline

        allow_pyannote_checkpoint_classes()

        device = setup_device(use_mps)
        print(f"Processing: {audio_path}", file=sys.stderr)
        print(f"Speaker range: {min_speakers}-{max_speakers}", file=sys.stderr)
        
        # Get HuggingFace token
        hf_token = os.environ.get('HF_TOKEN')
        if not hf_token:
            print("WARNING: HF_TOKEN not set - may fail for private models", file=sys.stderr)
        
        # Load pipeline
        print("Loading pyannote diarization pipeline...", file=sys.stderr)
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )

        # pyannote returns None instead of raising when it cannot download the gated models
        if pipeline is None:
            return {
                "error": (
                    "Could not download the pyannote models. Check that your HuggingFace token "
                    "is stored (npm run setup:token) and that you have accepted the licences for "
                    "pyannote/speaker-diarization-3.1 and pyannote/segmentation-3.0."
                ),
                "code": "SETUP_ERROR"
            }

        # Move to device
        if hasattr(pipeline, 'to') and device != "cpu":
            pipeline.to(device)
        
        print("Running diarization...", file=sys.stderr)
        
        # Run diarization
        import torchaudio
        info = torchaudio.info(audio_path)
        if info.num_frames <= PIECE_SECONDS * info.sample_rate:
            diarization = pipeline(
                audio_path,
                min_speakers=min_speakers,
                max_speakers=max_speakers
            )
            segments = segments_from(diarization)
        else:
            segments = diarize_in_pieces(pipeline, audio_path, info, min_speakers, max_speakers)

        print(f"Diarization complete: {len(segments)} segments, {len(set(seg['speaker'] for seg in segments))} speakers", file=sys.stderr)
        
        return {
            "segments": segments,
            "num_speakers": len(set(seg["speaker"] for seg in segments)),
            "model": "pyannote-3.1",
            "device": str(device)
        }
        
    except Exception as e:
        import traceback
        print(f"Diarization error: {e}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        return {"error": str(e)}

def main():
    try:
        audio_path = sys.argv[1]
        min_speakers = int(sys.argv[2])
        max_speakers = int(sys.argv[3])
        use_mps = sys.argv[4] == "true"

        result = diarize_with_pyannote(audio_path, min_speakers, max_speakers, use_mps)

        # Output result as JSON
        print(json.dumps(result))
        
        if "error" in result:
            sys.exit(1)
        else:
            sys.exit(0)
            
    except Exception as e:
        import traceback
        error_result = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
