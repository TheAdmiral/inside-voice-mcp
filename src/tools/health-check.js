import { arch, cpus, platform } from 'node:os';
import { z } from 'zod';
import { checkInstallation } from '../whisper.js';
import { DEFAULT_MODEL, getInstalledModels, getModelsDir, isVadModelInstalled } from '../models.js';
import { findHuggingFaceToken } from '../utils/huggingface-auth.js';
import { jsonResult } from './tool-result.js';

// From least to most serious.
const STATUSES = ['healthy', 'warning', 'critical'];

/** Returns whichever status is more serious. */
function moreSerious(status, otherStatus) {
  return STATUSES.indexOf(otherStatus) > STATUSES.indexOf(status) ? otherStatus : status;
}

/** The default model if it is installed, otherwise the first installed model. */
function chooseRecommendedModel(installedNames) {
  if (installedNames.includes(DEFAULT_MODEL) || installedNames.length === 0) {
    return DEFAULT_MODEL;
  }

  return installedNames[0];
}

async function handler() {
  const installation = await checkInstallation();
  const installedNames = getInstalledModels().map((model) => model.name);
  const vadModelInstalled = isVadModelInstalled();
  // Only the source and any problem are used, so the token never reaches the tool output.
  const { source: tokenSource, problem: tokenProblem } = await findHuggingFaceToken();
  const recommendedThreads = Math.min(4, cpus().length);

  let status = 'healthy';
  const issues = [];
  const recommendations = [];

  if (!installation.installed) {
    status = moreSerious(status, 'critical');
    issues.push('whisper.cpp not installed or not in PATH');
    recommendations.push('Install whisper.cpp: brew install whisper-cpp');
  }

  if (installedNames.length === 0) {
    status = moreSerious(status, 'warning');
    issues.push('No whisper models found');
    recommendations.push(`Install a model: inside-voice-mcp models install ${DEFAULT_MODEL}`);
  }

  // Only speaker diarization needs the HuggingFace token.
  if (tokenProblem) {
    status = moreSerious(status, 'warning');
    issues.push(tokenProblem);
  } else if (!tokenSource) {
    recommendations.push(
      'For speaker diarization, store a HuggingFace token: inside-voice-mcp setup-token',
    );
  }

  if (!vadModelInstalled) {
    recommendations.push(
      'To skip silence, which is faster and more accurate, install the VAD model: ' +
        'inside-voice-mcp models install vad',
    );
  }

  recommendations.push(`Recommended thread count: ${recommendedThreads}`);

  return jsonResult({
    status,
    whisper_installed: installation.installed,
    whisper_version: installation.version,
    installation_error: installation.error,
    models_directory: getModelsDir(),
    models_available: installedNames,
    recommended_model: chooseRecommendedModel(installedNames),
    vad_model_installed: vadModelInstalled,
    huggingface_token_source: tokenSource,
    system_info: {
      platform: platform(),
      arch: arch(),
      threads_available: cpus().length,
    },
    diagnostics: {
      issues,
      recommendations,
      recommended_threads: recommendedThreads,
    },
  });
}

export const healthCheckTool = {
  name: 'health_check',
  description: 'Check whisper.cpp installation and system configuration',
  argsSchema: z.object({}),
  handler,
};
