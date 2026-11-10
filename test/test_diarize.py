"""
Tests for how python/diarize.py plans pieces and links speakers across them.

These need numpy but not the pyannote models. Run them with: npm run test:python
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "python"))

import diarize  # noqa: E402

SAMPLE_RATE = 16000
FRAMES_PER_PIECE = diarize.PIECE_SECONDS * SAMPLE_RATE

VOICE_A = np.array([1.0, 0.0, 0.0])
VOICE_B = np.array([0.0, 1.0, 0.0])
VOICE_C = np.array([0.0, 0.0, 1.0])


def speaker(piece, name, duration, embedding):
    return {"piece": piece, "speaker": name, "duration": duration, "embedding": embedding}


class LinkSpeakersTests(unittest.TestCase):
    def test_no_speech_gives_no_speakers(self):
        self.assertEqual(diarize.link_speakers([], max_speakers=10), {})

    def test_the_same_voice_is_linked_across_pieces(self):
        labels = diarize.link_speakers(
            [
                speaker(0, "first", 100, VOICE_A),
                speaker(1, "same-voice", 90, VOICE_A),
                speaker(1, "other-voice", 80, VOICE_B),
            ],
            max_speakers=10,
        )

        self.assertEqual(labels[(0, "first")], labels[(1, "same-voice")])

    def test_different_voices_stay_apart(self):
        labels = diarize.link_speakers(
            [speaker(0, "first", 100, VOICE_A), speaker(1, "second", 90, VOICE_B)],
            max_speakers=10,
        )

        self.assertNotEqual(labels[(0, "first")], labels[(1, "second")])

    def test_speakers_from_one_piece_stay_apart_even_if_they_sound_alike(self):
        labels = diarize.link_speakers(
            [speaker(0, "first", 100, VOICE_A), speaker(0, "second", 90, VOICE_A)],
            max_speakers=10,
        )

        self.assertNotEqual(labels[(0, "first")], labels[(0, "second")])

    def test_max_speakers_is_enforced(self):
        labels = diarize.link_speakers(
            [
                speaker(0, "first", 100, VOICE_A),
                speaker(0, "second", 90, VOICE_B),
                speaker(0, "third", 80, VOICE_C),
            ],
            max_speakers=2,
        )

        self.assertEqual(len(set(labels.values())), 2)

    def test_speakers_are_still_labelled_when_nobody_has_a_fingerprint(self):
        labels = diarize.link_speakers(
            [speaker(0, "first", 100, None), speaker(1, "second", 5, None)],
            max_speakers=10,
        )

        self.assertEqual(len(labels), 2)

    def test_a_speaker_without_a_fingerprint_is_still_labelled(self):
        labels = diarize.link_speakers(
            [speaker(0, "first", 100, VOICE_A), speaker(0, "second", 5, None)],
            max_speakers=10,
        )

        self.assertEqual(len(labels), 2)

    def test_a_single_short_speaker_gets_a_label(self):
        labels = diarize.link_speakers([speaker(0, "only", 5, VOICE_A)], max_speakers=10)

        self.assertEqual(labels, {(0, "only"): "SPEAKER_00"})

    def test_labels_are_ordered_by_talking_time(self):
        labels = diarize.link_speakers(
            [speaker(0, "quieter", 100, VOICE_A), speaker(1, "talkative", 200, VOICE_B)],
            max_speakers=10,
        )

        self.assertEqual(labels[(1, "talkative")], "SPEAKER_00")
        self.assertEqual(labels[(0, "quieter")], "SPEAKER_01")


class UsableEmbeddingTests(unittest.TestCase):
    def test_all_zero_fingerprint_is_unusable(self):
        self.assertFalse(diarize.is_usable_embedding(np.zeros(3)))

    def test_invalid_fingerprint_is_unusable(self):
        self.assertFalse(diarize.is_usable_embedding(np.array([np.nan, 1.0, 0.0])))

    def test_normal_fingerprint_is_usable(self):
        self.assertTrue(diarize.is_usable_embedding(VOICE_A))


class AudioInfo:
    """The parts of torchaudio's audio information that plan_pieces reads"""

    sample_rate = SAMPLE_RATE

    def __init__(self, seconds):
        self.num_frames = seconds * SAMPLE_RATE


def planned_pieces(seconds):
    """Returns (start in seconds, frames to read) for each piece of audio this long"""
    return [(piece["offset"], piece["num_frames"]) for piece in diarize.plan_pieces(AudioInfo(seconds))]


class PlanPiecesTests(unittest.TestCase):
    def test_a_short_leftover_joins_the_last_piece(self):
        self.assertEqual(planned_pieces(1230), [(0, FRAMES_PER_PIECE), (600, -1)])

    def test_a_long_leftover_is_its_own_piece(self):
        self.assertEqual(
            planned_pieces(1260),
            [(0, FRAMES_PER_PIECE), (600, FRAMES_PER_PIECE), (1200, -1)],
        )

    def test_a_sixty_seven_minute_recording_is_seven_pieces(self):
        self.assertEqual(len(planned_pieces(4017)), 7)


if __name__ == "__main__":
    unittest.main()
