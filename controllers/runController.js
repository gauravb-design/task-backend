import Run from '../models/Run.js';
import chalk from 'chalk';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');
const SCRAPER_PATH = path.resolve(SERVER_ROOT, 'scraper.js');

const appendRunLog = async (runId, level, message) => {
  try {
    await Run.findByIdAndUpdate(runId, {
      $push: {
        logs: {
          timestamp: new Date(),
          level,
          message: message.trim()
        }
      }
    });
  } catch (error) {
    console.error(chalk.red(`❌ Failed to append run log (${runId}): ${error.message}`));
  }
};

/**
 * Get all crawl runs
 * GET /api/runs
 */
export const getRuns = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const runs = await Run.find(query)
      .sort({ run_date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Run.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        runs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error fetching runs: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error fetching runs',
      error: error.message
    });
  }
};

/**
 * Get single run by ID
 * GET /api/runs/:id
 */
export const getRunById = async (req, res) => {
  try {
    const run = await Run.findById(req.params.id);

    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'Run not found'
      });
    }

    res.status(200).json({
      success: true,
      data: run
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching run',
      error: error.message
    });
  }
};

/**
 * Create new run
 * POST /api/runs
 */
export const createRun = async (req, res) => {
  try {
    const { csv_file_name, initiated_by } = req.body;

    const run = await Run.create({
      csv_file_name: csv_file_name || 'unknown',
      initiated_by: initiated_by || 'automated',
      status: 'running'
    });

    console.log(chalk.blue(`🚀 New crawl run started: ${run._id}`));

    res.status(201).json({
      success: true,
      message: 'Run created successfully',
      data: run
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error creating run: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error creating run',
      error: error.message
    });
  }
};

/**
 * Trigger scraper execution via API
 * POST /api/runs/trigger
 */
export const triggerScraper = async (req, res) => {
  const {
    csvFileName,
    initiatedBy = 'api',
    headless,
    environment = {}
  } = req.body || {};

  try {
    const run = await Run.create({
      csv_file_name: csvFileName || '',
      initiated_by: initiatedBy,
      status: 'running',
      logs: [{
        timestamp: new Date(),
        level: 'info',
        message: 'Scraper triggered via API'
      }]
    });

    const scraperEnv = {
      ...process.env,
      RUN_ID: run._id.toString(),
      ...(csvFileName ? { CSV_FILE_NAME: csvFileName } : {}),
      ...(typeof headless === 'boolean' ? { HEADLESS: headless ? 'true' : 'false' } : {}),
      ...Object.entries(environment).reduce((acc, [key, value]) => {
        if (typeof key === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {})
    };

    const startTime = Date.now();

    const scraperProcess = spawn(process.execPath, [SCRAPER_PATH], {
      cwd: SERVER_ROOT,
      env: scraperEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    scraperProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(chalk.cyan(`[SCRAPER ${run._id}] ${message.trim()}`));
      appendRunLog(run._id, 'info', message);
    });

    scraperProcess.stderr.on('data', (data) => {
      const message = data.toString();
      console.error(chalk.red(`[SCRAPER ${run._id}] ${message.trim()}`));
      appendRunLog(run._id, 'error', message);
    });

    scraperProcess.on('error', async (error) => {
      await Run.findByIdAndUpdate(run._id, {
        status: 'failed',
        error_message: error.message,
        duration_seconds: Math.round((Date.now() - startTime) / 1000)
      });

      console.error(chalk.red(`❌ Failed to spawn scraper process: ${error.message}`));
    });

    scraperProcess.on('close', async (code) => {
      const status = code === 0 ? 'completed' : 'failed';
      const update = {
        status,
        duration_seconds: Math.round((Date.now() - startTime) / 1000)
      };

      if (status === 'failed') {
        update.error_message = `Scraper exited with code ${code}`;
      }

      try {
        await Run.findByIdAndUpdate(run._id, update);
      } catch (error) {
        console.error(chalk.red(`❌ Failed to update run ${run._id}: ${error.message}`));
      }
    });

    res.status(202).json({
      success: true,
      message: 'Scraper started',
      data: {
        runId: run._id,
        pid: scraperProcess.pid
      }
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error triggering scraper: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error triggering scraper',
      error: error.message
    });
  }
};

/**
 * Update run
 * PATCH /api/runs/:id
 */
export const updateRun = async (req, res) => {
  try {
    const run = await Run.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'Run not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Run updated successfully',
      data: run
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating run',
      error: error.message
    });
  }
};

/**
 * Get run statistics
 * GET /api/runs/stats
 */
export const getRunStats = async (req, res) => {
  try {
    const totalRuns = await Run.countDocuments();
    const completedRuns = await Run.countDocuments({ status: 'completed' });
    const failedRuns = await Run.countDocuments({ status: 'failed' });

    const recentRuns = await Run.find()
      .sort({ run_date: -1 })
      .limit(5)
      .select('run_date status total_tasks_found tasks_imported');

    res.status(200).json({
      success: true,
      data: {
        total: totalRuns,
        completed: completedRuns,
        failed: failedRuns,
        recent: recentRuns
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching run statistics',
      error: error.message
    });
  }
};

