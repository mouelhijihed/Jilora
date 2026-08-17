const crypto = require("crypto");
const { getPool, withTransaction } = require("../db/pool");
const { fail } = require("../utils/domain");
const { camelizeRow, camelizeRows, dateKey, startOfWeek, addDays } = require("../utils/records");
const presenceService = require("./presenceService");

const invitationDays = 7;
const sessionInviteHours = 24;

async function membership(userId, client = getPool(), lock = false) {
    const result = await client.query(
        `SELECT p.id partnership_id,p.created_at partnership_created_at,
                self.id user_id,self.username,self.first_name,self.last_name,
                partner.id partner_id,partner.username partner_username,partner.first_name partner_first_name,partner.last_name partner_last_name
         FROM partnership_members pm
         JOIN partnerships p ON p.id=pm.partnership_id
         JOIN users self ON self.id=pm.user_id
         JOIN partnership_members other ON other.partnership_id=p.id AND other.user_id<>pm.user_id
         JOIN users partner ON partner.id=other.user_id
         WHERE pm.user_id=$1 ${lock ? "FOR UPDATE OF p" : ""}`,
        [userId],
    );
    return result.rows[0] || null;
}

async function settingsFor(userId, client = getPool()) {
    return camelizeRow((await client.query("SELECT * FROM partner_settings WHERE user_id=$1", [userId])).rows[0]);
}

async function notification(client, userId, partnershipId, type, title, body = "", metadata = {}) {
    await client.query(
        "INSERT INTO partner_notifications(id,user_id,partnership_id,type,title,body,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [crypto.randomUUID(), userId, partnershipId || null, type, title, body, metadata],
    );
}

async function expireInvitations(client, userId) {
    await client.query(
        "UPDATE partner_invitations SET status='cancelled',updated_at=NOW() WHERE status='pending' AND expires_at<=NOW() AND (sender_id=$1 OR receiver_id=$1)",
        [userId],
    );
}

async function expireSessions(client, userId) {
    await client.query(
        `UPDATE partner_sessions ps SET status='cancelled',updated_at=NOW()
         FROM partnership_members pm
         WHERE pm.partnership_id=ps.partnership_id AND pm.user_id=$1
           AND ps.status='pending' AND ps.expires_at<=NOW()`,
        [userId],
    );
}

async function lockUsers(client, userIds) {
    await client.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[...userIds].sort()]);
}

async function getState(userId) {
    await Promise.all([expireInvitations(getPool(), userId), expireSessions(getPool(), userId)]);
    const member = await membership(userId);
    const [invitations, notifications, openSession] = await Promise.all([
        getPool().query(
            `SELECT i.*,s.first_name sender_first_name,s.last_name sender_last_name,s.username sender_username,
                    r.first_name receiver_first_name,r.last_name receiver_last_name,r.username receiver_username
             FROM partner_invitations i JOIN users s ON s.id=i.sender_id JOIN users r ON r.id=i.receiver_id
             WHERE i.status='pending' AND i.expires_at>NOW() AND (i.sender_id=$1 OR i.receiver_id=$1)
             ORDER BY i.created_at DESC`, [userId],
        ),
        getPool().query(
            `SELECT * FROM partner_notifications
             WHERE user_id=$1 AND archived_at IS NULL
               AND (
                   partnership_id=$2
                   OR (partnership_id IS NULL AND type='partner_invitation' AND metadata->>'invitationId' IN (
                       SELECT id::text FROM partner_invitations
                       WHERE status='pending' AND expires_at>NOW() AND receiver_id=$1
                   ))
               )
             ORDER BY created_at DESC LIMIT 30`,
            [userId, member?.partnership_id || null],
        ),
        getPool().query(
            `SELECT ps.* FROM partner_sessions ps JOIN partnership_members pm ON pm.partnership_id=ps.partnership_id
             WHERE pm.user_id=$1 AND ps.status IN ('pending','active','paused') ORDER BY ps.created_at DESC LIMIT 1`, [userId],
        ),
    ]);
    return {
        partnership: member ? {
            id: member.partnership_id,
            createdAt: member.partnership_created_at,
            partner: { id: member.partner_id, username: member.partner_username, firstName: member.partner_first_name, lastName: member.partner_last_name },
        } : null,
        incomingInvitations: invitations.rows.filter((row) => row.receiver_id === userId).map((row) => ({ id: row.id, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, sender: { username: row.sender_username, firstName: row.sender_first_name, lastName: row.sender_last_name } })),
        outgoingInvitations: invitations.rows.filter((row) => row.sender_id === userId).map((row) => ({ id: row.id, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, receiver: { username: row.receiver_username, firstName: row.receiver_first_name, lastName: row.receiver_last_name } })),
        notifications: camelizeRows(notifications.rows),
        activeSession: openSession.rows[0] ? await formatSession(userId, openSession.rows[0]) : null,
    };
}

async function invite(userId, identifier) {
    const value = identifier.toLowerCase();
    return withTransaction(async (client) => {
        await expireInvitations(client, userId);
        const target = (await client.query("SELECT id,username,first_name,last_name FROM users WHERE LOWER(email)=$1 OR LOWER(username)=$1", [value])).rows[0];
        if (!target) fail("No registered user matches that email or username", 404);
        if (target.id === userId) fail("You cannot invite yourself");
        await lockUsers(client, [userId, target.id]);
        if (await membership(userId, client, true)) fail("Remove your current partner before inviting someone else", 409);
        if (await membership(target.id, client, true)) fail("That user already has a partner", 409);
        const duplicate = await client.query(
            "SELECT 1 FROM partner_invitations WHERE status='pending' AND expires_at>NOW() AND ((sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1))",
            [userId, target.id],
        );
        if (duplicate.rowCount) fail("A partner invitation is already pending", 409);
        const id = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + invitationDays * 86400000);
        await client.query("INSERT INTO partner_invitations(id,sender_id,receiver_id,expires_at) VALUES($1,$2,$3,$4)", [id, userId, target.id, expiresAt]);
        const sender = (await client.query("SELECT first_name,last_name FROM users WHERE id=$1", [userId])).rows[0];
        await notification(client, target.id, null, "partner_invitation", "Partner invitation received", `${sender.first_name} ${sender.last_name} wants to become your partner.`, { invitationId: id });
        return { id, status: "pending", expiresAt, receiver: { username: target.username, firstName: target.first_name, lastName: target.last_name } };
    });
}

async function acceptInvitation(userId, invitationId) {
    await withTransaction(async (client) => {
        const invitation = (await client.query("SELECT * FROM partner_invitations WHERE id=$1 AND receiver_id=$2 FOR UPDATE", [invitationId, userId])).rows[0];
        if (!invitation) fail("Partner invitation not found", 404);
        if (invitation.status !== "pending") fail("This invitation is no longer pending", 409);
        if (new Date(invitation.expires_at) <= new Date()) {
            await client.query("UPDATE partner_invitations SET status='cancelled',updated_at=NOW() WHERE id=$1", [invitationId]);
            fail("This invitation has expired", 409);
        }
        await lockUsers(client, [userId, invitation.sender_id]);
        if (await membership(userId, client, true)) fail("You already have a partner", 409);
        if (await membership(invitation.sender_id, client, true)) fail("The sender already has a partner", 409);
        const [userAId, userBId] = [invitation.sender_id, invitation.receiver_id].sort();
        const partnershipId = crypto.randomUUID();
        await client.query("INSERT INTO partnerships(id,user_a_id,user_b_id) VALUES($1,$2,$3)", [partnershipId, userAId, userBId]);
        await client.query("INSERT INTO partnership_members(partnership_id,user_id) VALUES($1,$2),($1,$3)", [partnershipId, userAId, userBId]);
        await client.query("INSERT INTO partner_settings(user_id,partnership_id) VALUES($1,$3),($2,$3)", [userAId, userBId, partnershipId]);
        await client.query("UPDATE partner_invitations SET status='accepted',responded_at=NOW(),updated_at=NOW() WHERE id=$1", [invitationId]);
        await client.query(
            "UPDATE partner_notifications SET partnership_id=$2 WHERE user_id=$1 AND type='partner_invitation' AND metadata->>'invitationId'=$3",
            [userId, partnershipId, invitationId],
        );
        await client.query("UPDATE partner_invitations SET status='cancelled',updated_at=NOW() WHERE status='pending' AND id<>$1 AND (sender_id=ANY($2::uuid[]) OR receiver_id=ANY($2::uuid[]))", [invitationId, [userAId, userBId]]);
        const receiver = (await client.query("SELECT first_name,last_name FROM users WHERE id=$1", [userId])).rows[0];
        await notification(client, invitation.sender_id, partnershipId, "partner_accepted", "Partner invitation accepted", `${receiver.first_name} ${receiver.last_name} accepted your invitation.`);
    });
    return getState(userId);
}

async function declineInvitation(userId, invitationId) {
    const result = await getPool().query(
        "UPDATE partner_invitations SET status='declined',responded_at=NOW(),updated_at=NOW() WHERE id=$1 AND receiver_id=$2 AND status='pending' AND expires_at>NOW() RETURNING id",
        [invitationId, userId],
    );
    if (!result.rowCount) fail("Partner invitation not found or no longer valid", 404);
}

async function cancelInvitation(userId, invitationId) {
    const result = await getPool().query("UPDATE partner_invitations SET status='cancelled',updated_at=NOW() WHERE id=$1 AND sender_id=$2 AND status='pending' RETURNING id", [invitationId, userId]);
    if (!result.rowCount) fail("Partner invitation not found", 404);
}

async function removePartner(userId) {
    return withTransaction(async (client) => {
        const member = await membership(userId, client, true);
        if (!member) fail("You do not have a partner", 404);
        await client.query(
            "UPDATE partner_notifications SET archived_at=COALESCE(archived_at,NOW()) WHERE partnership_id=$1 AND archived_at IS NULL",
            [member.partnership_id],
        );
        await client.query(
            `DELETE FROM activity_sessions
             WHERE partner_session_id IN (
                 SELECT id FROM partner_sessions WHERE partnership_id=$1 AND status IN ('pending','active','paused','cancelled','declined')
             )`,
            [member.partnership_id],
        );
        await client.query("DELETE FROM partnerships WHERE id=$1", [member.partnership_id]);
    });
}

async function getSettings(userId) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    return settingsFor(userId);
}

async function updateSettings(userId, input) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const result = await getPool().query(
        `UPDATE partner_settings SET share_study_time=$2,share_study_subjects=$3,share_homework_progress=$4,share_gym_progress=$5,
         share_job_hours=$6,share_current_activity=$7,share_calendar=$8,share_detailed_tasks=$9,share_detailed_workouts=$10,updated_at=NOW()
         WHERE user_id=$1 RETURNING *`,
        [userId,input.shareStudyTime,input.shareStudySubjects,input.shareHomeworkProgress,input.shareGymProgress,input.shareJobHours,input.shareCurrentActivity,input.shareCalendar,input.shareDetailedTasks,input.shareDetailedWorkouts],
    );
    return camelizeRow(result.rows[0]);
}

async function aggregateFor(userId, settings, own = false) {
    const today = dateKey(), weekStart = startOfWeek(), weekEnd = addDays(weekStart, 6);
    const [user, study, homework, gym, job, active, sharedSession, calendar, tasks, workoutDetails, presence] = await Promise.all([
        getPool().query("SELECT id,username,first_name,last_name FROM users WHERE id=$1", [userId]),
        getPool().query(`SELECT
          COALESCE((SELECT SUM(actual_minutes) FROM study_sessions WHERE user_id=$1 AND session_date=$2),0)+COALESCE((SELECT SUM(actual_duration)/60 FROM activity_sessions WHERE user_id=$1 AND activity='study' AND session_type='focus' AND status='completed' AND completed_at::date=$2),0) today_minutes,
          COALESCE((SELECT SUM(actual_minutes) FROM study_sessions WHERE user_id=$1 AND session_date BETWEEN $3 AND $4),0)+COALESCE((SELECT SUM(actual_duration)/60 FROM activity_sessions WHERE user_id=$1 AND activity='study' AND session_type='focus' AND status='completed' AND completed_at::date BETWEEN $3 AND $4),0) week_minutes,
          COALESCE((SELECT COUNT(*) FROM activity_sessions WHERE user_id=$1 AND activity='study' AND session_type='focus' AND status='completed' AND completed_at::date BETWEEN $3 AND $4),0) pomodoros`, [userId,today,weekStart,weekEnd]),
        getPool().query("SELECT COUNT(*) FILTER(WHERE status<>'cancelled') total,COUNT(*) FILTER(WHERE status='completed') completed,MIN(due_date) FILTER(WHERE status NOT IN ('completed','cancelled') AND due_date>=CURRENT_DATE) next_due FROM homework WHERE user_id=$1", [userId]),
        getPool().query("SELECT COUNT(*) FILTER(WHERE workout_date BETWEEN $2 AND $3 AND completed) week_completed,BOOL_OR(completed) FILTER(WHERE workout_date=$4) today_completed FROM scheduled_workouts WHERE user_id=$1 AND status<>'cancelled'", [userId,weekStart,weekEnd,today]),
        getPool().query("SELECT COALESCE(SUM(actual_minutes) FILTER(WHERE work_date=$2),0) today_minutes,COALESCE(SUM(actual_minutes) FILTER(WHERE work_date BETWEEN $3 AND $4),0) week_minutes FROM work_sessions WHERE user_id=$1", [userId,today,weekStart,weekEnd]),
        getPool().query("SELECT activity,subject,topic,status FROM activity_sessions WHERE user_id=$1 AND status IN ('running','paused') ORDER BY started_at DESC LIMIT 1", [userId]),
        getPool().query(
            `SELECT ps.status FROM partner_sessions ps
             JOIN partner_session_members psm ON psm.session_id=ps.id
             WHERE psm.user_id=$1 AND psm.joined_at IS NOT NULL AND psm.left_at IS NULL AND psm.completed_at IS NULL
               AND ps.status IN ('active','paused')
             ORDER BY ps.created_at DESC LIMIT 1`,
            [userId],
        ),
        getPool().query("SELECT title,type,event_date,start_time,end_time FROM calendar_events WHERE user_id=$1 AND event_date>=CURRENT_DATE ORDER BY event_date,start_time LIMIT 5", [userId]),
        getPool().query("SELECT title,category,due_date,completed FROM tasks WHERE user_id=$1 AND completed=FALSE ORDER BY due_date NULLS LAST LIMIT 5", [userId]),
        getPool().query("SELECT name,workout_date,completed FROM scheduled_workouts WHERE user_id=$1 AND workout_date BETWEEN $2 AND $3 AND status<>'cancelled' ORDER BY workout_date LIMIT 5", [userId,weekStart,weekEnd]),
        presenceService.getPresence(userId),
    ]);
    const allow = (key) => own || Boolean(settings?.[key]);
    const activeRow = active.rows[0];
    const sharedRow = sharedSession.rows[0];
    const activityStatus = activeRow
        ? activeRow.status === "paused" ? "On break" : activeRow.activity === "study" ? "Studying" : activeRow.activity === "job" ? "Working" : activeRow.activity === "gym" ? "Working out" : "Active"
        : sharedRow ? sharedRow.status === "paused" ? "On break" : "Studying" : presence.status;
    const status = !presence.online ? "Offline" : allow("shareCurrentActivity") ? activityStatus : presence.status;
    return {
        user: { id:user.rows[0].id,username:user.rows[0].username,firstName:user.rows[0].first_name,lastName:user.rows[0].last_name },
        status,
        presence,
        study: allow("shareStudyTime") ? { todayMinutes:Number(study.rows[0].today_minutes),weekMinutes:Number(study.rows[0].week_minutes),pomodoros:Number(study.rows[0].pomodoros),currentSubject:allow("shareStudySubjects")&&activeRow?.activity==="study"?(activeRow.subject||null):undefined } : null,
        homework: allow("shareHomeworkProgress") ? { completed:Number(homework.rows[0].completed),total:Number(homework.rows[0].total),nextDue:homework.rows[0].next_due } : null,
        gym: allow("shareGymProgress") ? { weekCompleted:Number(gym.rows[0].week_completed),todayCompleted:Boolean(gym.rows[0].today_completed) } : null,
        job: allow("shareJobHours") ? { todayMinutes:Number(job.rows[0].today_minutes),weekMinutes:Number(job.rows[0].week_minutes) } : null,
        calendar: allow("shareCalendar") ? camelizeRows(calendar.rows) : undefined,
        tasks: allow("shareDetailedTasks") ? camelizeRows(tasks.rows) : undefined,
        workouts: allow("shareDetailedWorkouts") ? camelizeRows(workoutDetails.rows) : undefined,
    };
}

async function sharedData(userId) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const [ownSettings, partnerSettings, activity] = await Promise.all([
        settingsFor(userId), settingsFor(member.partner_id),
        getPool().query(
            `SELECT a.*,u.first_name,u.last_name
             FROM partner_activity a
             JOIN users u ON u.id=a.actor_id
             JOIN partner_settings s ON s.user_id=a.actor_id AND s.partnership_id=a.partnership_id
             WHERE a.partnership_id=$1 AND (
                 a.type='encouragement'
                 OR (a.type IN ('pomodoro_completed','shared_session_completed') AND s.share_study_time)
                 OR (a.type='homework_completed' AND s.share_homework_progress)
                 OR (a.type='workout_completed' AND s.share_gym_progress)
             )
             ORDER BY a.created_at DESC LIMIT 30`,
            [member.partnership_id],
        ),
    ]);
    return {
        self: await aggregateFor(userId, ownSettings, true),
        partner: await aggregateFor(member.partner_id, partnerSettings, false),
        activity: activity.rows.map((row) => ({ id:row.id,type:row.type,message:row.message,createdAt:row.created_at,actor:{ id:row.actor_id,firstName:row.first_name,lastName:row.last_name } })),
    };
}

async function metricValue(userId, type, start, end, settings, own = false) {
    if (type === "custom") return 0;
    if (!own && (type === "study_minutes" || type === "pomodoros") && !settings.shareStudyTime) return null;
    if (!own && type === "homework_completed" && !settings.shareHomeworkProgress) return null;
    if (type === "study_minutes") {
        const row = (await getPool().query(`SELECT COALESCE((SELECT SUM(actual_minutes) FROM study_sessions WHERE user_id=$1 AND session_date BETWEEN $2 AND $3),0)+COALESCE((SELECT SUM(actual_duration)/60 FROM activity_sessions WHERE user_id=$1 AND activity='study' AND session_type='focus' AND status='completed' AND completed_at::date BETWEEN $2 AND $3),0) value`, [userId,start,end])).rows[0];
        return Number(row.value);
    }
    if (type === "pomodoros") return Number((await getPool().query("SELECT COUNT(*) value FROM activity_sessions WHERE user_id=$1 AND activity='study' AND session_type='focus' AND status='completed' AND completed_at::date BETWEEN $2 AND $3", [userId,start,end])).rows[0].value);
    return Number((await getPool().query("SELECT COUNT(*) value FROM homework WHERE user_id=$1 AND status='completed' AND completed_date BETWEEN $2 AND $3", [userId,start,end])).rows[0].value);
}

async function formatGoal(goal, members, viewerId) {
    let value = Number(goal.manual_progress);
    let contributors = [];
    if (goal.type !== "custom") {
        value = 0;
        for (const memberId of members) {
            const settings = await settingsFor(memberId);
            const contribution = await metricValue(memberId, goal.type, dateKey(goal.start_date), dateKey(goal.end_date), settings, memberId === viewerId);
            const person = (await getPool().query("SELECT id,username,first_name,last_name FROM users WHERE id=$1", [memberId])).rows[0];
            contributors.push({ user:{id:person.id,username:person.username,firstName:person.first_name,lastName:person.last_name}, value:contribution, isSelf:memberId===viewerId });
            if (contribution !== null) value += contribution;
        }
    }
    const target = Number(goal.target);
    return { ...camelizeRow(goal), startDate:dateKey(goal.start_date), endDate:dateKey(goal.end_date), target, manualProgress:Number(goal.manual_progress), progress:value, percent:target>0?Math.min(100,Math.max(0,Math.round(value/target*1000)/10)):0, contributors };
}

async function goals(userId) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const rows = (await getPool().query("SELECT * FROM shared_goals WHERE partnership_id=$1 AND active=TRUE ORDER BY end_date,created_at", [member.partnership_id])).rows;
    return Promise.all(rows.map((goal) => formatGoal(goal, [userId, member.partner_id], userId)));
}

async function createGoal(userId, input) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const row = (await getPool().query("INSERT INTO shared_goals(id,partnership_id,title,type,target,manual_progress,start_date,end_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [crypto.randomUUID(),member.partnership_id,input.title,input.type,input.target,input.type==="custom"?(input.manualProgress||0):0,input.startDate,input.endDate,userId])).rows[0];
    return formatGoal(row, [userId, member.partner_id], userId);
}

async function updateGoal(userId, goalId, input) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const result = await getPool().query("UPDATE shared_goals SET title=$3,type=$4,target=$5,manual_progress=$6,start_date=$7,end_date=$8,updated_at=NOW() WHERE id=$1 AND partnership_id=$2 AND active=TRUE RETURNING *", [goalId,member.partnership_id,input.title,input.type,input.target,input.type==="custom"?(input.manualProgress||0):0,input.startDate,input.endDate]);
    if (!result.rowCount) fail("Shared goal not found", 404);
    return formatGoal(result.rows[0], [userId, member.partner_id], userId);
}

async function deleteGoal(userId, goalId) {
    const member = await membership(userId);
    if (!member) fail("You do not have a partner", 404);
    const result = await getPool().query("UPDATE shared_goals SET active=FALSE,updated_at=NOW() WHERE id=$1 AND partnership_id=$2 AND active=TRUE RETURNING id", [goalId,member.partnership_id]);
    if (!result.rowCount) fail("Shared goal not found", 404);
}

function sessionElapsed(row, now = new Date()) {
    if (!row.started_at) return 0;
    const end = row.status === "paused" && row.paused_at ? new Date(row.paused_at) : row.status === "completed" && row.completed_at ? new Date(row.completed_at) : now;
    return Math.max(0, Math.min(row.duration_seconds, Math.floor((end-new Date(row.started_at))/1000)-row.total_paused_seconds));
}

async function formatSession(userId, row, client = getPool()) {
    const members = (await client.query("SELECT m.*,u.first_name,u.last_name,u.username FROM partner_session_members m JOIN users u ON u.id=m.user_id WHERE m.session_id=$1 ORDER BY u.first_name", [row.id])).rows;
    const inviterSettings = await settingsFor(row.invited_by, client);
    const session = camelizeRow(row);
    if (row.invited_by !== userId && !inviterSettings?.shareStudySubjects) session.subjectName = "";
    return { ...session, elapsedSeconds:sessionElapsed(row), members:members.map((item)=>({user:{id:item.user_id,firstName:item.first_name,lastName:item.last_name,username:item.username},joinedAt:item.joined_at,leftAt:item.left_at,completedAt:item.completed_at,actualSeconds:item.actual_seconds,isSelf:item.user_id===userId})) };
}

async function createStudySession(userId, input) {
    return withTransaction(async (client) => {
        const member = await membership(userId, client, true);
        if (!member) fail("You do not have a partner", 404);
        let subjectName = "";
        if (input.subjectId) {
            const settings = await settingsFor(userId, client);
            if (!settings?.shareStudySubjects) fail("Enable study subject sharing before adding a subject", 403);
            const subject = (await client.query("SELECT name FROM subjects WHERE id=$1 AND user_id=$2", [input.subjectId,userId])).rows[0];
            if (!subject) fail("Subject not found", 404);
            subjectName = subject.name;
        }
        const id = crypto.randomUUID(), expiresAt = new Date(Date.now()+sessionInviteHours*3600000);
        const row = (await client.query("INSERT INTO partner_sessions(id,partnership_id,invited_by,subject_name,duration_seconds,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [id,member.partnership_id,userId,subjectName,input.durationMinutes*60,expiresAt])).rows[0];
        await client.query("INSERT INTO partner_session_members(session_id,user_id,joined_at) VALUES($1,$2,NOW()),($1,$3,NULL)", [id,userId,member.partner_id]);
        const inviter = (await client.query("SELECT first_name,last_name FROM users WHERE id=$1", [userId])).rows[0];
        await notification(client,member.partner_id,member.partnership_id,"study_invitation","Study together invitation",`${inviter.first_name} ${inviter.last_name} wants to study with you.`,{sessionId:id});
        return formatSession(userId,row,client);
    });
}

async function sessionResource(client, userId, sessionId, lock = true) {
    const member = await membership(userId, client, lock);
    if (!member) fail("You do not have a partner", 404);
    const row = (await client.query(`SELECT * FROM partner_sessions WHERE id=$1 AND partnership_id=$2 ${lock?"FOR UPDATE":""}`, [sessionId,member.partnership_id])).rows[0];
    if (!row) fail("Partner study session not found", 404);
    return { member, row };
}

async function joinSession(userId, sessionId) {
    return withTransaction(async (client) => {
        const { member, row } = await sessionResource(client,userId,sessionId);
        const personal = (await client.query("SELECT * FROM partner_session_members WHERE session_id=$1 AND user_id=$2", [sessionId,userId])).rows[0];
        if (row.status === "active" && personal?.joined_at && !personal.left_at) return formatSession(userId,row,client);
        if (row.status !== "pending") fail("This study invitation is no longer pending",409);
        if (new Date(row.expires_at)<=new Date()) { await client.query("UPDATE partner_sessions SET status='cancelled',updated_at=NOW() WHERE id=$1",[sessionId]); fail("This study invitation has expired",409); }
        await client.query("UPDATE partner_session_members SET joined_at=COALESCE(joined_at,NOW()),left_at=NULL WHERE session_id=$1 AND user_id=$2",[sessionId,userId]);
        const joined = Number((await client.query("SELECT COUNT(*) count FROM partner_session_members WHERE session_id=$1 AND joined_at IS NOT NULL AND left_at IS NULL",[sessionId])).rows[0].count);
        let updated = row;
        if (joined===2) updated=(await client.query("UPDATE partner_sessions SET status='active',started_at=NOW(),paused_at=NULL,total_paused_seconds=0,updated_at=NOW() WHERE id=$1 RETURNING *",[sessionId])).rows[0];
        if(joined===2){await notification(client,row.invited_by,member.partnership_id,"study_started","Shared study session starting","Your partner joined the study session.",{sessionId});}
        return formatSession(userId,updated,client);
    });
}

async function declineSession(userId, sessionId) {
    return withTransaction(async(client)=>{const {row}=await sessionResource(client,userId,sessionId);if(row.invited_by===userId)fail("The inviter must cancel the session",403);if(row.status!=="pending")fail("This study invitation is no longer pending",409);await client.query("UPDATE partner_sessions SET status='declined',updated_at=NOW() WHERE id=$1",[sessionId]);});
}

async function leaveSession(userId, sessionId) {
    return withTransaction(async(client)=>{const {row}=await sessionResource(client,userId,sessionId);if(!["pending","active","paused"].includes(row.status))return formatSession(userId,row,client);await client.query("UPDATE partner_session_members SET left_at=COALESCE(left_at,NOW()) WHERE session_id=$1 AND user_id=$2 AND completed_at IS NULL",[sessionId,userId]);const remaining=Number((await client.query("SELECT COUNT(*) count FROM partner_session_members WHERE session_id=$1 AND joined_at IS NOT NULL AND left_at IS NULL AND completed_at IS NULL",[sessionId])).rows[0].count);let updated=row;if(row.status==="pending"||remaining===0){await discardSessionHistory(client,sessionId);updated=(await client.query("UPDATE partner_sessions SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING *",[sessionId])).rows[0];}return formatSession(userId,updated,client);});
}

async function pauseSession(userId, sessionId) {
    return withTransaction(async(client)=>{const {member,row}=await sessionResource(client,userId,sessionId);if(row.status==="paused")return formatSession(userId,row,client);if(row.status!=="active")fail("Only an active session can be paused",409);const updated=(await client.query("UPDATE partner_sessions SET status='paused',paused_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",[sessionId])).rows[0];await notification(client,member.partner_id,member.partnership_id,"study_paused","Pomodoro paused","Your partner paused the Pomodoro.",{sessionId});return formatSession(userId,updated,client);});
}

async function resumeSession(userId, sessionId) {
    return withTransaction(async(client)=>{const {member,row}=await sessionResource(client,userId,sessionId);if(row.status==="active")return formatSession(userId,row,client);if(row.status!=="paused")fail("Only a paused session can be resumed",409);const paused=Math.max(0,Math.floor((Date.now()-new Date(row.paused_at).getTime())/1000));const updated=(await client.query("UPDATE partner_sessions SET status='active',total_paused_seconds=total_paused_seconds+$2,paused_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[sessionId,paused])).rows[0];await notification(client,member.partner_id,member.partnership_id,"study_resumed","Pomodoro resumed","Your partner resumed the Pomodoro.",{sessionId});return formatSession(userId,updated,client);});
}

async function discardSessionHistory(client, sessionId) {
    await client.query("DELETE FROM activity_sessions WHERE partner_session_id=$1", [sessionId]);
    await client.query("UPDATE partner_session_members SET completed_at=NULL,actual_seconds=0,personal_session_id=NULL WHERE session_id=$1", [sessionId]);
}

async function completeSession(userId, sessionId) {
    return withTransaction(async(client)=>{
        const {member,row}=await sessionResource(client,userId,sessionId);
        if(!["active","paused","completed"].includes(row.status))fail("This session cannot be completed",409);
        const personal=(await client.query("SELECT * FROM partner_session_members WHERE session_id=$1 AND user_id=$2 FOR UPDATE",[sessionId,userId])).rows[0];
        if(!personal?.joined_at||personal.left_at)fail("You are not an active participant",403);
        if(personal.completed_at)return formatSession(userId,row,client);
        const actual=sessionElapsed(row);
        if(actual<=0)fail("Study duration must be positive",409);
        const personalSessionId=crypto.randomUUID(),completedAt=new Date(),startedAt=new Date(row.started_at);
        await client.query(`INSERT INTO activity_sessions(id,user_id,activity,subject,topic,planned_duration,actual_duration,status,session_type,pomodoro_number,started_at,completed_at,partner_session_id)
            VALUES($1,$2,'study',$3,'Partner study session',$4,$5,'completed','focus',0,$6,$7,$8)`,[personalSessionId,userId,row.subject_name,row.duration_seconds,actual,startedAt,completedAt,sessionId]);
        await client.query("UPDATE partner_session_members SET completed_at=$3,actual_seconds=$4,personal_session_id=$5 WHERE session_id=$1 AND user_id=$2",[sessionId,userId,completedAt,actual,personalSessionId]);
        const incomplete=Number((await client.query("SELECT COUNT(*) count FROM partner_session_members WHERE session_id=$1 AND joined_at IS NOT NULL AND left_at IS NULL AND completed_at IS NULL",[sessionId])).rows[0].count);
        let updated=row;
        if(incomplete===0){updated=(await client.query("UPDATE partner_sessions SET status='completed',completed_at=NOW(),paused_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[sessionId])).rows[0];await recordSharedActivity(userId,"shared_session_completed","Completed a shared study session.",client);}
        await notification(client,member.partner_id,member.partnership_id,"study_completed","Partner finished studying","Your partner completed their part of the shared study session.",{sessionId});
        return formatSession(userId,updated,client);
    });
}

async function cancelSession(userId, sessionId) { return withTransaction(async(client)=>{const {member,row}=await sessionResource(client,userId,sessionId);if(row.status==="cancelled")return;if(!["pending","active","paused"].includes(row.status))fail("This session can no longer be cancelled",409);await discardSessionHistory(client,sessionId);await client.query("UPDATE partner_sessions SET status='cancelled',updated_at=NOW() WHERE id=$1",[sessionId]);await notification(client,member.partner_id,member.partnership_id,"study_cancelled","Pomodoro cancelled","Your partner cancelled the Pomodoro.",{sessionId});}); }

async function encouragement(userId, message) {
    return withTransaction(async(client)=>{const member=await membership(userId,client,true);if(!member)fail("You do not have a partner",404);const actor=(await client.query("SELECT first_name FROM users WHERE id=$1",[userId])).rows[0];await notification(client,member.partner_id,member.partnership_id,"encouragement",`${actor.first_name} sent encouragement`,message);await client.query("INSERT INTO partner_activity(id,partnership_id,actor_id,type,message) VALUES($1,$2,$3,'encouragement',$4)",[crypto.randomUUID(),member.partnership_id,userId,`Sent encouragement: ${message}.`]);});
}

async function listNotifications(userId) {
    const member = await membership(userId);
    return camelizeRows((await getPool().query(
        `SELECT * FROM partner_notifications
         WHERE user_id=$1 AND archived_at IS NULL
           AND (
               partnership_id=$2
               OR (partnership_id IS NULL AND type='partner_invitation' AND metadata->>'invitationId' IN (
                   SELECT id::text FROM partner_invitations
                   WHERE status='pending' AND expires_at>NOW() AND receiver_id=$1
               ))
           )
         ORDER BY created_at DESC LIMIT 50`,
        [userId, member?.partnership_id || null],
    )).rows);
}
async function readNotification(userId, notificationId) { const result=await getPool().query("UPDATE partner_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 AND archived_at IS NULL RETURNING *",[notificationId,userId]);if(!result.rowCount)fail("Notification not found",404);return camelizeRow(result.rows[0]); }
async function clearNotifications(userId) { await getPool().query("UPDATE partner_notifications SET archived_at=NOW() WHERE user_id=$1 AND archived_at IS NULL",[userId]); }

async function recordSharedActivity(userId,type,message,client=getPool()) {
    const member=await membership(userId,client);
    if(!member)return;
    const settings=await settingsFor(userId,client);
    const allowed=((type==="pomodoro_completed"||type==="shared_session_completed")&&settings.shareStudyTime)||(type==="homework_completed"&&settings.shareHomeworkProgress)||(type==="workout_completed"&&settings.shareGymProgress);
    if(!allowed)return;
    await client.query("INSERT INTO partner_activity(id,partnership_id,actor_id,type,message) VALUES($1,$2,$3,$4,$5)",[crypto.randomUUID(),member.partnership_id,userId,type,message]);
}

async function dashboardSummary(userId) { const member=await membership(userId);if(!member)return null;const data=await sharedData(userId);return{partner:data.partner.user,presence:data.partner.presence,status:data.partner.status,study:data.partner.study,homework:data.partner.homework,workout:data.partner.gym,job:data.partner.job,activity:data.activity.slice(0,3)}; }

module.exports={getState,invite,acceptInvitation,declineInvitation,cancelInvitation,removePartner,getSettings,updateSettings,sharedData,goals,createGoal,updateGoal,deleteGoal,createStudySession,joinSession,declineSession,leaveSession,pauseSession,resumeSession,completeSession,cancelSession,encouragement,listNotifications,readNotification,clearNotifications,recordSharedActivity,dashboardSummary};
