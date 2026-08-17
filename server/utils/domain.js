function fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
}

function schedule(input, label = "Schedule") {
    const start = Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3));
    const end = Number(input.endTime.slice(0, 2)) * 60 + Number(input.endTime.slice(3));
    if (end <= start) fail(`${label} end time must be later than start time`);
    return { date: input.date, startTime: input.startTime, endTime: input.endTime, plannedMinutes: end - start };
}

function ownedNotFound(name) {
    return fail(`${name} not found`, 404);
}

module.exports = { fail, schedule, ownedNotFound };
