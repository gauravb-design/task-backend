import Task from '../models/Task.js';
import Project from '../models/Project.js';
import Run from '../models/Run.js';
import Assignment from '../models/Assignment.js';
import User from '../models/User.js';
import TaskComment from '../models/TaskComment.js';
import chalk from 'chalk';

/**
 * Import tasks from crawler
 * POST /api/tasks/import
 */
export const importTasks = async (req, res) => {
  try {
    const { tasks, runId, csvFileName } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tasks array is required' 
      });
    }

    console.log(chalk.blue(`📥 Importing ${tasks.length} tasks...`));

    // Create or update run record
    let run;
    if (runId) {
      run = await Run.findById(runId);
    } else {
      run = await Run.create({
        csv_file_name: csvFileName || 'unknown',
        total_tasks_found: tasks.length,
        status: 'running'
      });
    }

    const imported = [];
    const updated = [];
    const skipped = [];

    for (const taskData of tasks) {
      try {
        // Check if task already exists
        const existing = await Task.findOne({
          project_id: taskData.projectId,
          parent_id: taskData.parentId
        });

        if (existing) {
          // Update existing task
          existing.task_name = taskData.taskName || existing.task_name;
          existing.project_name = taskData.projectName || existing.project_name;
          existing.task_url = taskData.link || existing.task_url;
          existing.category = taskData.category || existing.category;
          existing.time_tracked = taskData.timeTracked || existing.time_tracked;
          existing.time_tracked_decimal = taskData.timeTrackedDecimal || existing.time_tracked_decimal;
          existing.run_id = run._id;

          await existing.save();
          updated.push(existing);
          console.log(chalk.yellow(`🔄 Updated: ${taskData.taskName}`));
        } else {
          // Create new task
          const newTask = await Task.create({
            task_name: taskData.taskName,
            project_name: taskData.projectName,
            project_id: taskData.projectId,
            parent_id: taskData.parentId,
            task_url: taskData.link,
            category: taskData.category || 'Uncategorized',
            time_tracked: taskData.timeTracked,
            time_tracked_decimal: taskData.timeTrackedDecimal || 0,
            run_id: run._id
          });

          imported.push(newTask);
          console.log(chalk.green(`✅ Imported: ${taskData.taskName}`));
        }

        // Update or create project record
        await Project.findOneAndUpdate(
          { project_id: taskData.projectId },
          {
            project_name: taskData.projectName,
            project_id: taskData.projectId,
            $inc: { total_tasks: existing ? 0 : 1 }
          },
          { upsert: true, new: true }
        );

      } catch (error) {
        console.error(chalk.red(`❌ Error processing task: ${error.message}`));
        skipped.push({ task: taskData, error: error.message });
      }
    }

    // Update run record
    run.status = 'completed';
    run.tasks_imported = imported.length;
    run.tasks_updated = updated.length;
    run.tasks_skipped = skipped.length;
    await run.save();

    console.log(chalk.green(`\n✅ Import complete!`));
    console.log(chalk.blue(`   Imported: ${imported.length}`));
    console.log(chalk.yellow(`   Updated: ${updated.length}`));
    console.log(chalk.red(`   Skipped: ${skipped.length}`));

    res.status(200).json({
      success: true,
      message: 'Tasks imported successfully',
      data: {
        imported: imported.length,
        updated: updated.length,
        skipped: skipped.length,
        runId: run._id
      }
    });

  } catch (error) {
    console.error(chalk.red(`❌ Import error: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error importing tasks',
      error: error.message
    });
  }
};

/**
 * Get all tasks with filters
 * GET /api/tasks
 */
export const getTasks = async (req, res) => {
  try {
    const {
      status,
      category,
      assigned_to,
      project_id,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (assigned_to) query.assigned_to = assigned_to;
    if (project_id) query.project_id = project_id;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const tasks = await Task.find(query)
      .populate('assigned_to', 'name email role')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Task.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        tasks,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error fetching tasks: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks',
      error: error.message
    });
  }
};

/**
 * Get single task by ID
 * GET /api/tasks/:id
 */
export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assigned_to', 'name email role')
      .populate('run_id');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.status(200).json({
      success: true,
      data: task
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching task',
      error: error.message
    });
  }
};

/**
 * Assign task to user
 * POST /api/tasks/:id/assign
 */
export const assignTask = async (req, res) => {
  try {
    const { assigned_to, due_date, estimate_hours, priority, notes } = req.body;

    if (!assigned_to) {
      return res.status(400).json({
        success: false,
        message: '`assigned_to` is required'
      });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const assignee = await User.findById(assigned_to);

    if (!assignee) {
      return res.status(404).json({
        success: false,
        message: 'Assigned user not found'
      });
    }

    if (assignee.role !== 'designer') {
      return res.status(400).json({
        success: false,
        message: 'Tasks can only be assigned to designers'
      });
    }

    if (!assignee.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign to an inactive user'
      });
    }

    let parsedDueDate = null;
    if (due_date) {
      const candidate = new Date(due_date);
      if (Number.isNaN(candidate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid `due_date` provided'
        });
      }
      parsedDueDate = candidate;
    }

    let parsedEstimate = undefined;
    if (estimate_hours !== undefined) {
      const candidate = Number(estimate_hours);
      if (Number.isNaN(candidate) || candidate < 0) {
        return res.status(400).json({
          success: false,
          message: '`estimate_hours` must be a non-negative number'
        });
      }
      parsedEstimate = candidate;
    }

    if (priority) {
      const allowedPriorities = Task.schema.path('priority').enumValues;
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: `Invalid priority. Allowed values: ${allowedPriorities.join(', ')}`
        });
      }
      task.priority = priority;
    }

    if (parsedDueDate) {
      task.due_date = parsedDueDate;
    }

    if (parsedEstimate !== undefined) {
      task.estimate_hours = parsedEstimate;
    }

    task.assigned_to = assignee._id;
    task.status = 'assigned';

    await task.save();

    const assignmentPayload = {
      task_id: task._id,
      assigned_to: assignee._id,
      assigned_by: req.user._id,
      due_date: parsedDueDate,
      estimate_hours: parsedEstimate,
      notes: notes || ''
    };

    const assignment = await Assignment.create(assignmentPayload);

    console.log(
      chalk.green(
        `✅ Task assigned: ${task.task_name} → ${assignee.name} by ${req.user.name || req.user.email}`
      )
    );

    res.status(200).json({
      success: true,
      message: 'Task assigned successfully',
      data: { task, assignment }
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error assigning task: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error assigning task',
      error: error.message
    });
  }
};

/**
 * Update task status
 * PATCH /api/tasks/:id/status
 */
export const updateTaskStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const allowedStatuses = Task.schema.path('status').enumValues;

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
      });
    }

    const userId = req.user._id.toString();
    const isDesigner = req.user.role === 'designer';
    const isOwner = task.assigned_to && task.assigned_to.toString() === userId;

    if (isDesigner && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Designers can only update their own tasks'
      });
    }

    if (status === 'in_review') {
      if (!notes || !notes.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Notes are required when submitting a task for review'
        });
      }
    }

    task.status = status;

    if (typeof notes === 'string') {
      task.designer_notes = notes.trim();
    }

    await task.save();

    if (status === 'completed') {
      await Assignment.findOneAndUpdate(
        { task_id: task._id },
        {
          status: 'completed',
          completed_at: new Date()
        }
      );
    } else if (status === 'in_review') {
      await Assignment.findOneAndUpdate(
        { task_id: task._id },
        {
          status: 'pending',
          completed_at: null,
        }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Task status updated',
      data: task
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating task status',
      error: error.message
    });
  }
};

/**
 * Get task statistics
 * GET /api/tasks/stats
 */
export const getTaskStats = async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments();
    const unassignedTasks = await Task.countDocuments({ status: 'unassigned' });
    const assignedTasks = await Task.countDocuments({ status: 'assigned' });
    const inProgressTasks = await Task.countDocuments({ status: 'in_progress' });
    const completedTasks = await Task.countDocuments({ status: 'completed' });

    const tasksByCategory = await Task.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalTasks,
        unassigned: unassignedTasks,
        assigned: assignedTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        byCategory: tasksByCategory
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

export const getTaskComments = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).select('_id');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const comments = await TaskComment.find({ task: task._id })
      .sort({ createdAt: 1 })
      .populate('author', 'name email role');

    res.status(200).json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error(chalk.red(`❌ Error fetching comments: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
};

export const addTaskComment = async (req, res) => {
  try {
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment body is required'
      });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const comment = await TaskComment.create({
      task: task._id,
      author: req.user._id,
      body: body.trim()
    });

    await comment.populate('author', 'name email role');

    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    console.error(chalk.red(`❌ Error creating comment: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error creating comment',
      error: error.message
    });
  }
};

/**
 * Delete a completed task
 * DELETE /api/tasks/:id
 */
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed tasks can be deleted'
      });
    }

    await Promise.all([
      Assignment.deleteMany({ task_id: task._id }),
      TaskComment.deleteMany({ task: task._id })
    ]);

    await task.deleteOne();

    console.log(chalk.green(`🗑️ Deleted completed task: ${task.task_name}`));

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error deleting task: ${error.message}`));
    res.status(500).json({
      success: false,
      message: 'Error deleting task',
      error: error.message
    });
  }
};

