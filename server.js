// =============================================
// 企业内部培训管理系统 - 后端服务
// =============================================

require('dotenv').config();

const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const path = require('path');

const app = express();

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 视图引擎配置
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));

// Oracle输出格式
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// 数据库连接池
let pool;

// 初始化数据库连接池
async function initDbPool() {
    try {
        pool = await oracledb.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING,
            poolMin: 1,
            poolMax: 10,
            poolIncrement: 1
        });
        console.log('✅ 培训系统数据库连接成功');
        console.log(`   连接地址: ${process.env.DB_CONNECT_STRING}`);
    } catch (err) {
        console.error('❌ 数据库连接失败:', err.message);
        process.exit(1);
    }
}

// 路由规则：URL路径 → 渲染哪个页面
app.get('/', (req, res) => {
    res.render('login');      // 访问 /  → 显示 login.ejs
});

app.get('/main', (req, res) => {
    res.render('index');      // 访问 /main → 显示 index.ejs
});

app.get('/about', (req, res) => {
    res.render('about');      // 访问 /about → 显示 about.ejs
});

app.get('/help', (req, res) => {
    res.render('help');       // 访问 /help → 显示 help.ejs
});

app.get('/profile', (req, res) => {
    res.render('profile');    // 访问 /profile → 显示 profile.ejs
});

// ============= 登录验证API =============
app.post('/api/login', async (req, res) => {
    let conn;
    const { empId, empPassword } = req.body;
    
    console.log('收到登录请求:', empId, empPassword);
    
    if (!empId || !empPassword) {
        return res.status(400).json({ success: false, error: '请填写员工ID和密码    ' });
    }
    
    try {
        conn = await pool.getConnection();
        
        const result = await conn.execute(
            `SELECT EMP_ID, EMP_NAME, DEPT_NAME, POSITION, STATUS 
             FROM EMPLOYEES 
             WHERE EMP_ID = :empId AND EMP_PASSWORD = :empPassword AND STATUS = '在职'`,
            [empId, empPassword]
        );
        
        console.log('查询结果行数:', result.rows.length);
        
        if (result.rows.length === 0) {
            return res.json({ 
                success: false, 
                error: '员工ID或密码不正确，或您已离职' 
            });
        }
        
        const employee = result.rows[0];
        
        res.json({
            success: true,
            message: '登录成功',
            empId: employee.EMP_ID,
            empName: employee.EMP_NAME,
            deptName: employee.DEPT_NAME,
            position: employee.POSITION
        });
    } catch (err) {
        console.error('登录失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 健康检查 =============
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: '培训管理系统运行正常' 
    });
});

// ============= 1. 获取所有课程 =============
app.get('/api/courses', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT C.COURSE_ID, C.COURSE_NAME, C.COURSE_TYPE, C.DURATION, 
                   C.START_TIME, C.END_TIME, C.LOCATION, C.COURSE_STATUS, C.BUDGET_AMOUNT,
                   T.TRAINER_NAME, T.STAR_LEVEL,
                   D.DEPT_NAME
            FROM TRAINING_COURSES C
            LEFT JOIN TRAINERS T ON C.TRAINER_ID = T.TRAINER_ID
            LEFT JOIN DEPARTMENTS_TRAINING D ON C.DEPT_ID = D.DEPT_ID
            WHERE C.COURSE_STATUS = '发布'
            ORDER BY C.START_TIME
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('获取课程失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 2. 获取单个课程详情 =============
app.get('/api/courses/:id', async (req, res) => {
    let conn;
    const { id } = req.params;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT C.*, T.TRAINER_NAME, D.DEPT_NAME 
            FROM TRAINING_COURSES C
            LEFT JOIN TRAINERS T ON C.TRAINER_ID = T.TRAINER_ID
            LEFT JOIN DEPARTMENTS_TRAINING D ON C.DEPT_ID = D.DEPT_ID
            WHERE C.COURSE_ID = :id
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: '课程不存在' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 3. 冲突检测（同一员工同一时间段） =============
app.post('/api/check-conflict', async (req, res) => {
    let conn;
    const { empId, courseId } = req.body;
    
    if (!empId || !courseId) {
        return res.json({ hasConflict: false, message: '请选择员工和课程' });
    }
    
    try {
        conn = await pool.getConnection();
        
        // 获取要报名的课程时间
        const courseResult = await conn.execute(
            `SELECT COURSE_NAME, START_TIME, END_TIME 
             FROM TRAINING_COURSES 
             WHERE COURSE_ID = :id`,
            [courseId]
        );
        
        if (courseResult.rows.length === 0) {
            return res.json({ hasConflict: false, message: '课程不存在' });
        }
        
        const newCourse = courseResult.rows[0];
        
        // 检查该员工已报名的课程是否有时间冲突
        const conflictResult = await conn.execute(`
            SELECT C.COURSE_NAME, C.START_TIME, C.END_TIME
            FROM TRAINING_REGISTRATIONS R
            JOIN TRAINING_COURSES C ON R.COURSE_ID = C.COURSE_ID
            WHERE R.EMP_ID = :empId 
            AND R.STATUS IN ('已报名', '已签到')
            AND (
                (C.START_TIME BETWEEN :newStart AND :newEnd)
                OR (C.END_TIME BETWEEN :newStart AND :newEnd)
                OR (:newStart BETWEEN C.START_TIME AND C.END_TIME)
                OR (:newEnd BETWEEN C.START_TIME AND C.END_TIME)
            )
        `, {
            empId: empId,
            newStart: newCourse.START_TIME,
            newEnd: newCourse.END_TIME
        });
        
        if (conflictResult.rows.length > 0) {
            res.json({ 
                hasConflict: true, 
                message: `⚠️ 时间冲突！您已报名课程：${conflictResult.rows[0].COURSE_NAME}` 
            });
        } else {
            res.json({ hasConflict: false, message: '✅ 无冲突，可以报名' });
        }
    } catch (err) {
        console.error('冲突检测失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 4. 员工报名课程 =============
app.post('/api/register', async (req, res) => {
    let conn;
    const { empId, courseId } = req.body;
    
    if (!empId || !courseId) {
        return res.status(400).json({ success: false, error: '请提供员工ID和课程ID' });
    }
    
    try {
        conn = await pool.getConnection();
        
        // 1. 检查黑名单
        const blackResult = await conn.execute(
            `SELECT * FROM BLACKLIST 
             WHERE EMP_ID = :empId AND STATUS = '生效中' 
             AND SYSDATE BETWEEN START_DATE AND END_DATE`,
            [empId]
        );
        
        if (blackResult.rows.length > 0) {
            return res.json({ success: false, error: '❌ 您已在黑名单中，无法报名' });
        }
        
        // 2. 获取课程信息
        const courseResult = await conn.execute(
            `SELECT START_TIME, END_TIME, MAX_STUDENTS, COURSE_NAME 
             FROM TRAINING_COURSES 
             WHERE COURSE_ID = :id`,
            [courseId]
        );
        
        if (courseResult.rows.length === 0) {
            return res.json({ success: false, error: '课程不存在' });
        }
        
        const newCourse = courseResult.rows[0];
        
        // 3. 检查人数是否已满
        const countResult = await conn.execute(
            `SELECT COUNT(*) AS CNT FROM TRAINING_REGISTRATIONS 
             WHERE COURSE_ID = :courseId AND STATUS IN ('已报名', '已签到')`,
            [courseId]
        );
        
        if (countResult.rows[0].CNT >= newCourse.MAX_STUDENTS) {
            return res.json({ success: false, error: '❌ 课程人数已满，无法报名' });
        }
        
        // 4. 检查是否已经报名
        const existingResult = await conn.execute(
            `SELECT * FROM TRAINING_REGISTRATIONS 
             WHERE EMP_ID = :empId AND COURSE_ID = :courseId`,
            { empId, courseId }
        );
        
        if (existingResult.rows.length > 0) {
            return res.json({ success: false, error: '❌ 您已经报名过该课程' });
        }
        
        // 5. 检查时间冲突
        const conflictResult = await conn.execute(`
            SELECT COUNT(*) AS CNT FROM TRAINING_REGISTRATIONS R
            JOIN TRAINING_COURSES C ON R.COURSE_ID = C.COURSE_ID
            WHERE R.EMP_ID = :empId AND R.STATUS IN ('已报名', '已签到')
            AND (
                (C.START_TIME BETWEEN :start1 AND :end1)
                OR (C.END_TIME BETWEEN :start2 AND :end2)
                OR (:start3 BETWEEN C.START_TIME AND C.END_TIME)
            )
        `, {
            empId: empId,
            start1: newCourse.START_TIME,
            end1: newCourse.END_TIME,
            start2: newCourse.START_TIME,
            end2: newCourse.END_TIME,
            start3: newCourse.START_TIME
        });
        
        if (conflictResult.rows[0].CNT > 0) {
            return res.json({ success: false, error: '❌ 时间冲突，无法报名' });
        }
        
        // 6. 执行报名
        await conn.execute(
            `INSERT INTO TRAINING_REGISTRATIONS (REG_ID, EMP_ID, COURSE_ID, STATUS)
             VALUES (SEQ_REG.NEXTVAL, :empId, :courseId, '已报名')`,
            { empId, courseId },
            { autoCommit: true }
        );
        
        res.json({ success: true, message: '✅ 报名成功！' });
    } catch (err) {
        console.error('报名失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 5. 获取员工的报名记录 =============
app.get('/api/my-registrations/:empId', async (req, res) => {
    let conn;
    const { empId } = req.params;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT R.REG_ID, R.STATUS, R.ACTUAL_HOURS, R.SIGNIN_TIME,
                   C.COURSE_NAME, C.COURSE_TYPE, C.DURATION, 
                   C.START_TIME, C.END_TIME, C.LOCATION,
                   T.TRAINER_NAME
            FROM TRAINING_REGISTRATIONS R
            JOIN TRAINING_COURSES C ON R.COURSE_ID = C.COURSE_ID
            LEFT JOIN TRAINERS T ON C.TRAINER_ID = T.TRAINER_ID
            WHERE R.EMP_ID = :empId
            ORDER BY C.START_TIME DESC
        `, [empId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 6. 培训签到 =============
app.post('/api/signin', async (req, res) => {
    let conn;
    const { regId, signinType } = req.body;
    
    if (!regId) {
        return res.status(400).json({ success: false, error: '请提供报名ID' });
    }
    
    try {
        conn = await pool.getConnection();
        
        const signinTime = new Date();
        
        // 获取课程开始时间和学时
        const courseResult = await conn.execute(`
            SELECT C.START_TIME, C.DURATION, C.COURSE_NAME, R.STATUS
            FROM TRAINING_REGISTRATIONS R
            JOIN TRAINING_COURSES C ON R.COURSE_ID = C.COURSE_ID
            WHERE R.REG_ID = :regId
        `, [regId]);
        
        if (courseResult.rows.length === 0) {
            return res.json({ success: false, error: '报名记录不存在' });
        }
        
        const record = courseResult.rows[0];
        
        if (record.STATUS === '已签到') {
            return res.json({ success: false, error: '您已经签到过了' });
        }
        
        const courseStart = new Date(record.START_TIME);
        const duration = record.DURATION;
        const courseName = record.COURSE_NAME;
        
        // 计算迟到分钟数
        const latenessMinutes = Math.max(0, Math.floor((signinTime - courseStart) / 60000));
        
        let deductHours = 0;
        let isOvertime = '否';
        
        if (latenessMinutes > 30) {
            deductHours = duration * 0.5;  // 超时30分钟以上扣一半学时
            isOvertime = '是';
        } else if (latenessMinutes > 0) {
            deductHours = duration * 0.2;  // 迟到扣20%学时
            isOvertime = '是';
        }
        
        const actualHours = duration - deductHours;
        
        // 更新报名表
        await conn.execute(
            `UPDATE TRAINING_REGISTRATIONS 
             SET STATUS = '已签到', SIGNIN_TIME = :signinTime, 
                 ACTUAL_HOURS = :actualHours, IS_OVERTIME = :isOvertime
             WHERE REG_ID = :regId`,
            { signinTime, actualHours, isOvertime, regId },
            { autoCommit: true }
        );
        
        // 插入签到记录
        await conn.execute(
            `INSERT INTO TRAINING_ATTENDANCE (ATTEND_ID, REG_ID, SIGNIN_TYPE, SIGNIN_TIME, LATENESS_MINUTES, DEDUCT_HOURS)
             VALUES (SEQ_ATTEND.NEXTVAL, :regId, :signinType, :signinTime, :latenessMinutes, :deductHours)`,
            { regId, signinType, signinTime, latenessMinutes, deductHours },
            { autoCommit: true }
        );
        
        let message = `✅ 签到成功！课程：${courseName}，获得学时：${actualHours}小时`;
        if (deductHours > 0) {
            message += `（迟到${latenessMinutes}分钟，扣减${deductHours}小时）`;
        }
        
        res.json({ success: true, message: message });
    } catch (err) {
        console.error('签到失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 7. 给讲师评分 =============
app.post('/api/rate-trainer', async (req, res) => {
    let conn;
    const { courseId, trainerId, empId, score, comment } = req.body;
    
    if (!courseId || !trainerId || !empId || !score) {
        return res.status(400).json({ success: false, error: '请提供完整评分信息' });
    }
    
    if (score < 1 || score > 5) {
        return res.status(400).json({ success: false, error: '评分必须在1-5之间' });
    }
    
    try {
        conn = await pool.getConnection();
        
        // 检查是否已评分
        const existingRating = await conn.execute(
            `SELECT * FROM TRAINER_RATINGS 
             WHERE COURSE_ID = :courseId AND EMP_ID = :empId`,
            [courseId, empId]
        );
        
        if (existingRating.rows.length > 0) {
            return res.json({ success: false, error: '您已经对该课程评分过了' });
        }
        
        // 检查员工是否真的参加了该课程
        const registrationCheck = await conn.execute(
            `SELECT * FROM TRAINING_REGISTRATIONS 
             WHERE EMP_ID = :empId AND COURSE_ID = :courseId 
             AND STATUS IN ('已签到', '已完成')`,
            { empId, courseId }
        );
        
        if (registrationCheck.rows.length === 0) {
            return res.json({ success: false, error: '您还没有完成该课程，无法评分' });
        }
        
        // 插入评分
        await conn.execute(
            `INSERT INTO TRAINER_RATINGS (RATING_ID, COURSE_ID, TRAINER_ID, EMP_ID, SCORE, COMMENT)
             VALUES (SEQ_RATING.NEXTVAL, :courseId, :trainerId, :empId, :score, :comment)`,
            { courseId, trainerId, empId, score, comment },
            { autoCommit: true }
        );
        
        // 更新讲师平均星级
        await conn.execute(`
            UPDATE TRAINERS T
            SET T.STAR_LEVEL = (
                SELECT ROUND(AVG(SCORE), 1)
                FROM TRAINER_RATINGS R
                WHERE R.TRAINER_ID = T.TRAINER_ID
            )
            WHERE T.TRAINER_ID = :trainerId
        `, [trainerId], { autoCommit: true });
        
        res.json({ success: true, message: '✅ 评分成功！感谢您的反馈' });
    } catch (err) {
        console.error('评分失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 8. 获取部门KPI =============
app.get('/api/kpi', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT * FROM V_DEPT_KPI
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('获取KPI失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 9. 获取预算使用情况 =============
app.get('/api/budget', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT * FROM V_BUDGET_USAGE
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('获取预算失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 10. 获取所有员工 =============
app.get('/api/employees', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT EMP_ID, EMP_NAME, DEPT_NAME, POSITION, EMAIL, PHONE, STATUS
            FROM EMPLOYEES
            WHERE STATUS = '在职'
            ORDER BY EMP_ID
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 11. 获取所有讲师 =============
app.get('/api/trainers', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT TRAINER_ID, TRAINER_NAME, TITLE, COMPANY, STAR_LEVEL, IS_INTERNAL
            FROM TRAINERS
            ORDER BY STAR_LEVEL DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 12. 获取所有部门 =============
app.get('/api/departments', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT DEPT_ID, DEPT_NAME, ANNUAL_BUDGET, USED_BUDGET, REMAIN_BUDGET
            FROM DEPARTMENTS_TRAINING
            ORDER BY DEPT_ID
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 13. 提交培训需求申请 =============
app.post('/api/request-training', async (req, res) => {
    let conn;
    const { empId, courseId, reason } = req.body;
    
    if (!empId || !courseId) {
        return res.status(400).json({ success: false, error: '请提供员工ID和课程ID' });
    }
    
    try {
        conn = await pool.getConnection();
        
        // 获取员工部门主管（这里简化，实际应从数据库获取）
        const empResult = await conn.execute(
            `SELECT EMP_NAME, DEPT_NAME FROM EMPLOYEES WHERE EMP_ID = :empId`,
            [empId]
        );
        
        if (empResult.rows.length === 0) {
            return res.json({ success: false, error: '员工不存在' });
        }
        
        await conn.execute(
            `INSERT INTO TRAINING_REQUESTS (REQUEST_ID, EMP_ID, COURSE_ID, REASON, STATUS)
             VALUES (SEQ_REQUEST.NEXTVAL, :empId, :courseId, :reason, '待审批')`,
            { empId, courseId, reason },
            { autoCommit: true }
        );
        
        res.json({ success: true, message: '✅ 培训申请已提交，请等待审批' });
    } catch (err) {
        console.error('提交申请失败:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 14. 获取课程统计（报名人数） =============
app.get('/api/course-stats', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT 
                C.COURSE_ID,
                C.COURSE_NAME,
                C.MAX_STUDENTS,
                COUNT(R.REG_ID) AS REGISTERED_COUNT,
                (C.MAX_STUDENTS - COUNT(R.REG_ID)) AS REMAINING_SLOTS
            FROM TRAINING_COURSES C
            LEFT JOIN TRAINING_REGISTRATIONS R ON C.COURSE_ID = R.COURSE_ID 
                AND R.STATUS IN ('已报名', '已签到')
            WHERE C.COURSE_STATUS = '发布'
            GROUP BY C.COURSE_ID, C.COURSE_NAME, C.MAX_STUDENTS
            ORDER BY C.START_TIME
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 15. 获取讲师评分统计 =============
app.get('/api/trainer-ratings/:trainerId', async (req, res) => {
    let conn;
    const { trainerId } = req.params;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(`
            SELECT 
                AVG(SCORE) AS AVG_SCORE,
                COUNT(*) AS TOTAL_RATINGS,
                MIN(SCORE) AS MIN_SCORE,
                MAX(SCORE) AS MAX_SCORE
            FROM TRAINER_RATINGS
            WHERE TRAINER_ID = :trainerId
        `, [trainerId]);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ============= 启动服务器 =============
const PORT = process.env.PORT || 3000;

async function startServer() {
    await initDbPool();
    
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🎓 企业内部培训管理系统已启动 🎓                        ║
╠══════════════════════════════════════════════════════════════╣
║  服务地址: http://localhost:${PORT}                           ║
║  前端页面: http://localhost:${PORT}                           ║
║  健康检查: http://localhost:${PORT}/api/health               ║
╠══════════════════════════════════════════════════════════════╣
║  📋 可用API接口:                                             ║
║  GET  /api/courses          - 课程列表                       ║
║  GET  /api/employees        - 员工列表                       ║
║  GET  /api/trainers         - 讲师列表                       ║
║  GET  /api/departments      - 部门列表                       ║
║  GET  /api/kpi              - 部门KPI                        ║
║  GET  /api/budget           - 预算使用情况                   ║
║  GET  /api/course-stats     - 课程统计                       ║
║  POST /api/register         - 报名课程                       ║
║  POST /api/check-conflict   - 冲突检测                       ║
║  POST /api/signin           - 培训签到                       ║
║  POST /api/rate-trainer     - 讲师评分                       ║
║  POST /api/request-training - 培训申请                       ║
╚══════════════════════════════════════════════════════════════╝
        `);
    });
}

startServer().catch(console.error);