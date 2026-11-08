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

def diarize_with_pyannote(audio_path, min_speakers, max_speakers, use_mps):
    """Run diarization using Pyannote.audio 3.1+"""
    try:
        from pyannote.audio import Pipeline
        
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
        diarization = pipeline(
            audio_path, 
            min_speakers=min_speakers, 
            max_speakers=max_speakers
        )
        
        # Convert to standardized format
        segments = []
        for segment, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "start": float(segment.start),
                "end": float(segment.end), 
                "speaker": str(speaker)
            })
        
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
