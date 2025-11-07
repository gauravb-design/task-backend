import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import connectDB from './config/db.js';
import Session from './models/Session.js';
import Task from './models/Task.js';

// Load environment variables
dotenv.config();

const SESSION_COOKIE_PATH = path.resolve(process.cwd(), 'sessionCookies.json');
const SESSION_SERVICE = 'smartsites';
const ASSIGNMENTS_URL = 'https://login.smartsites.com/reports/assignments';
const DEFAULT_ASSIGNMENTS_PRESET = 'Dashboard';

let dbConnectionPromise = null;

const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input#username',
  'input[name="email"]',
  'input#email',
  'input[type="email"]'
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input#password',
  'input[type="password"]'
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button#login',
  'button[data-testid="login"]'
];

async function waitForVisibleElement(page, selectors, timeout = 30000) {
  const start = Date.now();
  const pollInterval = 250;

  while (Date.now() - start < timeout) {
    const frames = page.frames();

    for (const frame of frames) {
      for (const selector of selectors) {
        const elementHandle = await frame.$(selector);

        if (!elementHandle) {
          continue;
        }

        const isVisible = await elementHandle.evaluate((el) => {
          if (!el || !el.ownerDocument) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        });

        if (isVisible) {
          return { frame, elementHandle, selector };
        }

        await elementHandle.dispose();
      }
    }

    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`Timeout waiting for selectors: ${selectors.join(', ')}`);
}

function getSessionIdentifier() {
  return process.env.SESSION_IDENTIFIER || process.env.SMARTSITES_EMAIL || 'default';
}

async function ensureDatabaseConnection() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB()
      .then(() => true)
      .catch((error) => {
        console.error(chalk.red(`❌ Failed to connect to MongoDB for session storage: ${error.message}`));
        throw error;
      });
  }

  return dbConnectionPromise;
}

async function saveCookies(page) {
    try {
        const cookies = await page.cookies();
        fs.writeFileSync(SESSION_COOKIE_PATH, JSON.stringify(cookies, null, 2));

    try {
      await ensureDatabaseConnection();

      await Session.findOneAndUpdate(
        {
          service: SESSION_SERVICE,
          identifier: getSessionIdentifier()
        },
        {
          cookies,
          metadata: {
            lastUpdated: new Date().toISOString(),
            runId: process.env.RUN_ID || ''
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      console.log(chalk.green('✅ Session cookies saved to database'));
    } catch (dbError) {
      console.error(chalk.yellow(`⚠️  Could not persist session cookies to database: ${dbError.message}`));
    }

    console.log(chalk.green('✅ Session cookies saved locally'));
  } catch (error) {
    console.error(chalk.red('❌ Error saving cookies:'), error.message);
  }
}

async function loadCookies(page) {
  try {
    await ensureDatabaseConnection();

    const session = await Session.findOne({
      service: SESSION_SERVICE,
      identifier: getSessionIdentifier()
    }).lean();

    if (session?.cookies?.length) {
      await page.setCookie(...session.cookies);
      console.log(chalk.green('✅ Session cookies loaded from database'));
      return true;
    }
  } catch (dbError) {
    console.error(chalk.yellow(`⚠️  Could not load cookies from database: ${dbError.message}`));
  }

  if (!fs.existsSync(SESSION_COOKIE_PATH)) {
    console.log(chalk.yellow('⚠️  No existing session cookies found locally'));
    return false;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(SESSION_COOKIE_PATH, 'utf8'));
    await page.setCookie(...cookies);
    console.log(chalk.green('✅ Session cookies loaded from file'));
    return true;
  } catch (fileError) {
    console.error(chalk.red('❌ Failed to load cookies from file:'), fileError.message);
    return false;
  }
}

async function loginToSmartSites(page, email, password) {
        console.log(chalk.blue('\n🔐 Logging in to SmartSites...'));

  try {
        await page.goto('https://login.smartsites.com/login', {
            waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const usernameField = await waitForVisibleElement(page, USERNAME_SELECTORS, 45000);
    const passwordField = await waitForVisibleElement(page, PASSWORD_SELECTORS, 45000);

    await usernameField.elementHandle.click({ clickCount: 3 });
    await usernameField.elementHandle.type(email, { delay: 50 });

    await passwordField.elementHandle.click({ clickCount: 3 });
    await passwordField.elementHandle.type(password, { delay: 50 });

        console.log(chalk.yellow('📝 Credentials entered'));

    const submitButton = await waitForVisibleElement(page, SUBMIT_SELECTORS, 30000);

    await submitButton.elementHandle.evaluate((el) => {
      try {
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      } catch (e) {
        /* ignore */
      }
    });

    const navigationPromise = page
      .waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
      .catch(() => null);

    const [navigationResult] = await Promise.all([
      navigationPromise,
      submitButton.elementHandle.click()
    ]);

    if (!navigationResult) {
      console.log(chalk.yellow('⚠️  No navigation detected after login submit (SPA or cached session).'));
    }

        const currentUrl = page.url();
    let pathname = '';

    try {
      pathname = new URL(currentUrl).pathname;
    } catch (parseError) {
      pathname = currentUrl;
    }

    if (/^\/login/i.test(pathname) || /[?&]login/i.test(currentUrl)) {
            console.error(chalk.red('❌ Login failed - still on login page'));
            return false;
        }

        console.log(chalk.green('✅ Login successful!'));
        await saveCookies(page);
        return true;
    } catch (error) {
        console.error(chalk.red(`❌ Login error: ${error.message}`));
        return false;
    }
}

async function goToAssignments(page) {
  console.log(chalk.blue(`\n📄 Navigating to assignments: ${ASSIGNMENTS_URL}`));

    try {
    await page.goto(ASSIGNMENTS_URL, {
            waitUntil: 'networkidle2',
      timeout: 45000
        });

        const currentUrl = page.url();
    const pageContent = await page.content();

    let pathname = '';

    try {
      pathname = new URL(currentUrl).pathname;
    } catch (parseError) {
      pathname = currentUrl;
    }

    if (/^\/login/i.test(pathname) || /[?&]login/i.test(currentUrl)) {
      console.log(chalk.yellow('⚠️  Redirected to login page when trying to open assignments. Session is not active.'));
      return { success: false, requiresLogin: true };
    }

    if (pageContent.includes('Something went wrong')) {
      console.log(
        chalk.yellow(
          '⚠️  The assignments page reported an error message: "Something went wrong. Please contact the technical support."'
        )
      );
    } else {
      console.log(chalk.green('✅ Assignments page loaded successfully'));
    }

    const presetResult = await selectAssignmentsPreset(page, DEFAULT_ASSIGNMENTS_PRESET);

    if (!presetResult.success) {
      console.log(
        chalk.yellow(
          `⚠️  Unable to select preset "${DEFAULT_ASSIGNMENTS_PRESET}": ${presetResult.message}`
        )
      );
        } else {
      console.log(chalk.green(`✅ Selected assignments preset: ${DEFAULT_ASSIGNMENTS_PRESET}`));
        }

    return { success: true, requiresLogin: false };
    } catch (error) {
    console.error(chalk.red(`❌ Failed to load assignments page: ${error.message}`));
    return { success: false, requiresLogin: false, error };
  }
}

async function selectAssignmentsPreset(page, presetName) {
  try {
    await page.waitForSelector('.custom_reports_dropdown', { visible: true, timeout: 30000 });

    const dropdownButton = await waitForVisibleElement(
      page,
      ['.custom_reports_dropdown button[data-qa-id="button-dropdown-open"]'],
      20000
    );

    await dropdownButton.elementHandle.click();

    await page.waitForSelector('.custom_reports_dropdown .menu .menu-list a', {
      visible: true,
      timeout: 15000
    });

    const clicked = await page.evaluate((targetPreset) => {
      const links = Array.from(
        document.querySelectorAll('.custom_reports_dropdown .menu .menu-list a')
      );

      const link = links.find((anchor) => anchor.textContent?.trim() === targetPreset);

      if (link) {
        link.click();
        return true;
      }

      return false;
    }, presetName);

    if (!clicked) {
      return { success: false, message: 'Preset link not found in dropdown' };
    }

    await page.waitForTimeout(1000);

    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function scrapeAssignmentsAndPersist(page, runId) {
  console.log(chalk.blue('\n🧮 Gathering assignments from dashboard...'));

  try {
    await page.waitForSelector('.assignment_result_group', { timeout: 30000 });
  } catch (error) {
    console.log(chalk.yellow('⚠️  No assignment groups found on the page.'));
    return { total: 0, saved: 0 };
  }

  const assignments = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('.assignment_result_group'));
    const results = [];

    groups.forEach((group, groupIdx) => {
      const header = group.querySelector('h2');
      const headerText = header?.textContent?.trim() || `Group ${groupIdx + 1}`;
      const projectName = headerText.replace(/\s*\(.*\)$/, '').trim();

      const links = Array.from(group.querySelectorAll('tbody tr td.col_name a[href]'));

      links.forEach((link, linkIdx) => {
        const text = link.textContent?.trim() || `Task ${linkIdx + 1}`;
        const href = link.getAttribute('href') || link.href;
        const absoluteUrl = link.href;
        const objectModal = link.getAttribute('object-modal') || null;

        results.push({
          groupHeader: headerText,
          projectName,
          displayedName: text,
          href,
          absoluteUrl,
          objectModal
        });
      });
    });

    return results;
  });

  if (!assignments.length) {
    console.log(chalk.yellow('⚠️  No assignment links found within the groups.'));
    return { total: 0, saved: 0 };
  }

  console.log(chalk.blue(`📋 Found ${assignments.length} assignments to process`));
  const assignmentsJson = JSON.stringify(assignments);

  await ensureDatabaseConnection();

  let savedCount = 0;

  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = JSON.parse(assignmentsJson)[index];
    const identifier = assignment.objectModal || assignment.absoluteUrl;

    console.log(chalk.blue(`\n🔍 [${index + 1}/${assignments.length}] ${assignment.displayedName}`));

    const clickSucceeded = await page.evaluate((id) => {
      const selector = id.startsWith('http')
        ? `a[href="${id}"]`
        : `a[object-modal="${id}"]`;

      const link = document.querySelector(selector);

      if (link) {
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }

      return false;
    }, identifier);

    if (!clickSucceeded) {
      console.log(chalk.yellow('⚠️  Could not trigger task sidebar (link not found).'));
      continue;
    }

    try {
      await page.waitForSelector('.task_name', { visible: true, timeout: 20000 });
    } catch (error) {
      console.log(chalk.yellow('⚠️  Task sidebar did not appear in time.')); 
      continue;
    }

    const modalData = await page.evaluate(() => {
      const taskNameEl = document.querySelector('.task_name');
      const projectNameEl = document.querySelector('.task__projectname .project_name_task_modal');

      return {
        taskName: taskNameEl?.textContent?.trim() || null,
        projectName: projectNameEl?.textContent?.trim() || null
      };
    });

    const finalTaskName = modalData.taskName || assignment.displayedName;
    const finalProjectName = modalData.projectName || assignment.projectName;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.waitForSelector('.task_name', { hidden: true, timeout: 10000 }).catch(() => {});

    const parsed = (() => {
      try {
        const url = new URL(assignment.absoluteUrl);
        const match = url.pathname.match(/projects\/(\d+)\/tasks\/(\d+)/);

        if (!match) {
          return { projectId: null, taskId: null };
        }

        return { projectId: match[1], taskId: match[2] };
      } catch (error) {
        return { projectId: null, taskId: null };
      }
    })();

    if (!parsed.projectId || !parsed.taskId) {
      console.log(chalk.yellow('⚠️  Could not parse project/task ID from link. Skipping.'));
      continue;
    }

    try {
      await Task.findOneAndUpdate(
        { project_id: parsed.projectId, parent_id: parsed.taskId },
        {
          task_name: finalTaskName,
          project_name: finalProjectName,
          project_id: parsed.projectId,
          parent_id: parsed.taskId,
          task_url: assignment.absoluteUrl,
          run_id: runId || undefined
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      savedCount += 1;
      console.log(chalk.green(`   💾 Saved task ${finalTaskName}`));
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to save task: ${error.message}`));
    }
  }

  console.log(chalk.green(`\n✅ Assignment scraping complete. Saved ${savedCount}/${assignments.length} tasks.`));

  return { total: assignments.length, saved: savedCount };
}
async function run() {
    console.log(chalk.green.bold('\n' + '='.repeat(60)));
  console.log(chalk.green.bold('🚀 SmartSites Login Automation'));
    console.log(chalk.green.bold('📅 ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })));
    console.log(chalk.green.bold('='.repeat(60) + '\n'));

  const email = process.env.SMARTSITES_EMAIL;
  const password = process.env.SMARTSITES_PASSWORD;
  const runId = process.env.RUN_ID || null;

  if (!email || !password) {
    console.error(chalk.red('❌ Missing SMARTSITES_EMAIL or SMARTSITES_PASSWORD in environment variables'));
            process.exit(1);
        }

  let browser;

  const envNodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const isProd = envNodeEnv === 'production';

  const headlessSetting = (() => {
    if (typeof process.env.HEADLESS === 'string') {
      const value = process.env.HEADLESS.trim().toLowerCase();

      if (['false', '0', 'no', 'off', ''].includes(value)) {
        return false;
      }

      if (['true', '1', 'yes', 'on'].includes(value)) {
        return true;
      }
    }

    return isProd;
  })();

  console.log(
    chalk.blue(
      `🧪 Launching browser in ${headlessSetting ? 'headless' : 'visible'} mode (NODE_ENV=${process.env.NODE_ENV || 'undefined'})`
    )
  );

  try {
        browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: headlessSetting ? { width: 1280, height: 720 } : null
        });

        const page = await browser.newPage();
    if (headlessSetting) {
      await page.setViewport({ width: 1280, height: 720 });
    }

    let authenticated = false;
    let assignmentsResult = null;

    const sessionLoaded = await loadCookies(page);

    if (sessionLoaded) {
      assignmentsResult = await goToAssignments(page);

      if (assignmentsResult.success) {
        authenticated = true;
      } else if (assignmentsResult.requiresLogin) {
        console.log(chalk.yellow('⚠️  Stored session is no longer valid. Proceeding with login.'));
      } else {
        const errorMessage = assignmentsResult.error?.message || 'Unknown error loading assignments with stored session';
        console.log(chalk.yellow(`⚠️  Could not load assignments with stored session: ${errorMessage}`));
      }
    }

    if (!authenticated) {
      const loggedIn = await loginToSmartSites(page, email, password);

      if (!loggedIn) {
        throw new Error('Unable to log in with provided credentials');
      }

      assignmentsResult = await goToAssignments(page);

      if (!assignmentsResult.success) {
        const errorMessage = assignmentsResult.requiresLogin
          ? 'Assignments page still requires login after authentication.'
          : assignmentsResult.error?.message || 'Assignments page could not be loaded after login';
        throw new Error(errorMessage);
      }

      authenticated = true;
    }

    if (!assignmentsResult?.success) {
      throw new Error('Assignments page is not ready for scraping');
    }

    await scrapeAssignmentsAndPersist(page, runId);

    console.log(chalk.green('\n✅ Session ready and assignments page loaded\n'));
    } catch (error) {
    console.error(chalk.red.bold('❌ Automation failed: ' + error.message));
    process.exitCode = 1;
  } finally {
    const keepBrowserOpenEnv = process.env.KEEP_BROWSER_OPEN?.toLowerCase();
    const keepBrowserOpen =
      keepBrowserOpenEnv === 'true' ||
      (keepBrowserOpenEnv !== 'false' && !headlessSetting);

    if (browser && !keepBrowserOpen) {
            await browser.close();
    } else if (browser) {
      console.log(
        chalk.blue(
          '\n🧭 Browser left open for inspection. Close it manually when you are done.'
        )
      );
        }

    console.log(chalk.green.bold('='.repeat(60)));
    console.log(chalk.green.bold('🏁 Script complete'));
    console.log(chalk.green.bold('='.repeat(60) + '\n'));
    }
}

run();


