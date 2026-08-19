export type PartnerPerson = { id?: string; username: string; firstName: string; lastName: string };

export type PartnerInvitation = {
    id: string;
    status: "pending" | "accepted" | "declined" | "cancelled";
    expiresAt: string;
    createdAt: string;
    sender?: PartnerPerson;
    receiver?: PartnerPerson;
};

export type PartnerNotification = {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
    readAt: string | null;
    createdAt: string;
};

export type PartnerSettings = {
    userId: string;
    partnershipId: string;
    shareStudyTime: boolean;
    shareStudySubjects: boolean;
    shareHomeworkProgress: boolean;
    shareGymProgress: boolean;
    shareJobHours: boolean;
    shareCurrentActivity: boolean;
    shareCalendar: boolean;
    shareDetailedTasks: boolean;
    shareDetailedWorkouts: boolean;
    createdAt: string;
    updatedAt: string;
};

export type PartnerSessionMember = {
    user: PartnerPerson & { id: string };
    joinedAt: string | null;
    leftAt: string | null;
    completedAt: string | null;
    actualSeconds: number;
    isSelf: boolean;
};

export type PartnerSession = {
    id: string;
    partnershipId: string;
    invitedBy: string;
    subjectName: string;
    durationSeconds: number;
    status: "pending" | "active" | "paused" | "completed" | "cancelled" | "declined";
    expiresAt: string;
    startedAt: string | null;
    pausedAt: string | null;
    totalPausedSeconds: number;
    completedAt: string | null;
    elapsedSeconds: number;
    members: PartnerSessionMember[];
};

export type PartnerState = {
    partnership: { id: string; createdAt: string; partner: PartnerPerson & { id: string } } | null;
    incomingInvitations: PartnerInvitation[];
    outgoingInvitations: PartnerInvitation[];
    notifications: PartnerNotification[];
    activeSession: PartnerSession | null;
};

export type PartnerAggregate = {
    user: PartnerPerson & { id: string };
    status: string;
    presence: { online: boolean; status: "Online" | "Offline"; lastSeenAt: string | null };
    study: { todayMinutes: number; weekMinutes: number; pomodoros: number; currentSubject?: string | null } | null;
    homework: { completed: number; total: number; nextDue: string | null } | null;
    gym: { weekCompleted: number; todayCompleted: boolean } | null;
    job: { todayMinutes: number; weekMinutes: number } | null;
    calendar?: Array<{ title: string; type: string; eventDate: string; startTime: string; endTime: string }>;
    tasks?: Array<{ title: string; category: string; dueDate: string | null; completed: boolean }>;
    workouts?: Array<{ name: string; workoutDate: string; completed: boolean }>;
};

export type PartnerSharedData = {
    self: PartnerAggregate;
    partner: PartnerAggregate;
    activity: Array<{ id: string; type: string; message: string; createdAt: string; actor: { id: string; firstName: string; lastName: string } }>;
};

export type SharedGoal = {
    id: string;
    partnershipId: string;
    title: string;
    type: "study_minutes" | "pomodoros" | "homework_completed" | "custom";
    target: number;
    manualProgress: number;
    startDate: string;
    endDate: string;
    createdBy: string;
    progress: number;
    percent: number;
    status: "active" | "completed" | "missed";
    contributors: Array<{ user: PartnerPerson & { id: string }; value: number | null; isSelf: boolean }>;
};
