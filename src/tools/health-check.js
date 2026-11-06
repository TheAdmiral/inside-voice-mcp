import { arch, cpus, platform } from 'node:os';
import { z } from 'zod';
import { checkInstallation, getAvailableModels } from '../whisper/integration.js';
import { jsonResult } from './tool-result.js';

async function handler() {
  try {
    const installation = await checkInstallation();
    const availableModels = getAvailableModels();

    const result = {
      whisper_installed: installation.installed,
      whisper_version: installation.version,
      models_available: availableModels,
      recommended_model: determineRecommendedModel(availableModels),
      system_info: {
        platform: platform(),
        arch: arch(),
        threads_available: cpus().length,
      },
    };

    return jsonResult({
      status: installation.installed ? 'healthy' : 'needs_setup',
      ...result,
      diagnostics: generateDiagnostics(result, installation.error),
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

  return availableModels[0] ?? 'base.en';
}

function generateDiagnostics(result, installationError) {
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
      'Download models: npm run setup:models or manually download to models/ directory',
    );
  }

  // Check M1 optimization
  if (result.system_info.arch === 'arm64' && result.system_info.platform === 'darwin') {
    diagnostics.m1_optimization = 'available';
    diagnostics.recommended_threads = Math.min(4, result.system_info.threads_available);
    diagnostics.recommendations.push(
      `Optimal thread count for M1: ${diagnostics.recommended_threads}`,
    );
  }

  // Set overall status if no issues found
  if (diagnostics.overall_status === 'unknown') {
    diagnostics.overall_status = result.models_available.length > 0 ? 'healthy' : 'warning';
  }

  return diagnostics;
}
