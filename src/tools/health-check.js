import { arch, cpus, platform } from 'node:os';
import { z } from 'zod';
import { checkInstallation } from '../whisper.js';
import { DEFAULT_MODEL, getInstalledModels, getModelsDir, isVadModelInstalled } from '../models.js';
import { findHuggingFaceToken } from '../utils/huggingface-auth.js';
import { jsonResult } from './tool-result.js';

async function handler() {
  try {
    const installation = await checkInstallation();
    const availableModels = getInstalledModels().map((model) => model.name);
    // Only the source and any problem are used, so the token never reaches the tool output.
    const { source: tokenSource, problem: tokenProblem } = await findHuggingFaceToken();

    const result = {
      whisper_installed: installation.installed,
      whisper_version: installation.version,
      models_directory: getModelsDir(),
      models_available: availableModels,
      recommended_model: determineRecommendedModel(availableModels),
      vad_model_installed: isVadModelInstalled(),
      huggingface_token_source: tokenSource,
      system_info: {
        platform: platform(),
        arch: arch(),
        threads_available: cpus().length,
      },
    };

    return jsonResult({
      status: installation.installed ? 'healthy' : 'needs_setup',
      ...result,
      diagnostics: generateDiagnostics(result, installation.error, tokenProblem),
      installation_error: installation.error,
    });
  } catch (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
}

export const healthCheckTool = {
  name: 'health_check',
  description: 'Check whisper.cpp installation and system configuration',
  argsSchema: z.object({}),
  handler,
};

function determineRecommendedModel(availableModels) {
  const priorities = ['base.en', 'tiny.en', 'small.en', 'base', 'small'];

  for (const model of priorities) {
    if (availableModels.includes(model)) {
      return model;
    }
  }

  return availableModels[0] ?? DEFAULT_MODEL;
}

function generateDiagnostics(result, installationError, tokenProblem) {
  const diagnostics = {
    overall_status: 'unknown',
    issues: [],
    recommendations: [],
  };

  // Check whisper installation
  if (!result.whisper_installed) {
    diagnostics.overall_status = 'critical';
    diagnostics.issues.push('whisper.cpp not installed or not in PATH');
    diagnostics.recommendations.push('Install whisper.cpp: brew install whisper-cpp');

    if (installationError) {
      diagnostics.installation_details = installationError;
    }
  }

  // Check models
  if (result.models_available.length === 0) {
    if (diagnostics.overall_status !== 'critical') {
      diagnostics.overall_status = 'warning';
    }
    diagnostics.issues.push('No whisper models found');
    diagnostics.recommendations.push(
      `Install a model: inside-voice-mcp models install ${DEFAULT_MODEL}`,
    );
  }

  // Check the HuggingFace token, which only speaker diarization needs
  if (tokenProblem) {
    if (diagnostics.overall_status !== 'critical') {
      diagnostics.overall_status = 'warning';
    }
    diagnostics.issues.push(tokenProblem);
  } else if (!result.huggingface_token_source) {
    diagnostics.recommendations.push(
      'For speaker diarization, store a HuggingFace token: inside-voice-mcp setup-token',
    );
  }

  if (!result.vad_model_installed) {
    diagnostics.recommendations.push(
      'To skip silence, which is faster and more accurate, install the VAD model: ' +
        'inside-voice-mcp models install vad',
    );
  }

  diagnostics.recommended_threads = Math.min(4, result.system_info.threads_available);
  diagnostics.recommendations.push(`Recommended thread count: ${diagnostics.recommended_threads}`);

  // Set overall status if no issues found
  if (diagnostics.overall_status === 'unknown') {
    diagnostics.overall_status = 'healthy';
  }

  return diagnostics;
}
