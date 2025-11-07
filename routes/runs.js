import express from 'express';
import {
  getRuns,
  getRunById,
  createRun,
  updateRun,
  getRunStats,
  triggerScraper
} from '../controllers/runController.js';

const router = express.Router();

// Run routes
router.get('/stats', getRunStats); // Must be before /:id route
router.post('/trigger', triggerScraper);
router.get('/', getRuns);
router.get('/:id', getRunById);
router.post('/', createRun);
router.patch('/:id', updateRun);

export default router;

