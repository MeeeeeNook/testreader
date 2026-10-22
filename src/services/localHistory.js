const KEY = "reading-room:history:v3";
const valid = (a) =>
  a &&
  typeof a.id === "string" &&
  typeof a.testId === "string" &&
  a.result &&
  Array.isArray(a.result.rows);
function list(value) {
  return Array.isArray(value) ? value.filter(valid) : [];
}
function parse(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function database(storage) {
  const value = parse(storage, KEY, {});
  return {
    accounts:
      value?.accounts &&
      typeof value.accounts === "object" &&
      !Array.isArray(value.accounts)
        ? value.accounts
        : {},
    guest: list(value?.guest),
    claimed: Array.isArray(value?.claimed) ? value.claimed : [],
  };
}
export function mergeAttempts(...groups) {
  const records = new Map();
  for (const group of groups)
    for (const item of list(group))
      records.set(item.id, { ...records.get(item.id), ...item });
  return [...records.values()].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  );
}
export function readAttempts(storage, owner = "guest") {
  const db = database(storage);
  const legacy = mergeAttempts(
    parse(storage, "reading-room:attempts", []),
    parse(storage, "reading-room:attempts:" + owner, []),
  ).filter(
    (a) =>
      (a.owner || "guest") === owner &&
      (owner !== "guest" || !db.claimed.includes(a.id)),
  );
  return mergeAttempts(
    legacy,
    owner === "guest" ? db.guest : list(db.accounts[owner]),
  ).filter((a) => (a.owner || "guest") === owner);
}
export function writeAttempts(storage, owner, attempts) {
  const db = database(storage);
  const clean = mergeAttempts(attempts).map(({ definition, ...a }) => ({
    ...a,
    owner,
  }));
  if (owner === "guest") db.guest = clean;
  else db.accounts = { ...db.accounts, [owner]: clean };
  storage.setItem(KEY, JSON.stringify(db));
  return clean;
}
export function saveAttempt(storage, owner, attempt) {
  if (!valid(attempt)) throw new Error("This result could not be saved.");
  return writeAttempts(
    storage,
    owner,
    mergeAttempts(readAttempts(storage, owner), [{ ...attempt, owner }]),
  );
}
export function claimGuestAttempts(storage, userId) {
  if (!userId || userId === "guest")
    throw new Error("A signed-in account is required.");
  const db = database(storage),
    guest = readAttempts(storage, "guest");
  if (!guest.length) return readAttempts(storage, userId);
  const claimed = guest.map(({ definition, ...a }) => ({
    ...a,
    owner: userId,
    syncedAt: undefined,
  }));
  db.accounts = {
    ...db.accounts,
    [userId]: mergeAttempts(readAttempts(storage, userId), claimed),
  };
  db.guest = [];
  db.claimed = [...new Set([...db.claimed, ...guest.map((a) => a.id)])];
  storage.setItem(KEY, JSON.stringify(db));
  return db.accounts[userId];
}
export async function syncHistoryRecords(
  storage,
  owner,
  remote,
  isCurrent = () => true,
) {
  const check = () => {
    if (!isCurrent()) throw new Error("Account changed.");
  };
  check();
  claimGuestAttempts(storage, owner);
  const cloud = await remote.list();
  check();
  const records = mergeAttempts(
    readAttempts(storage, owner),
    list(cloud).map((a) => ({ ...a, owner, syncedAt: Date.now() })),
  );
  writeAttempts(storage, owner, records);
  // Drain again after each upload: another tab/session can finish while sync is in flight.
  let pending = readAttempts(storage, owner).filter((a) => !a.syncedAt);
  while (pending.length) {
    const record = pending[0];
    check();
    const { syncedAt, definition, ...data } = record;
    await remote.put({ ...data, owner });
    check();
    writeAttempts(
      storage,
      owner,
      mergeAttempts(readAttempts(storage, owner), [
        { ...record, syncedAt: Date.now() },
      ]),
    );
    pending = readAttempts(storage, owner).filter((a) => !a.syncedAt);
  }
  return readAttempts(storage, owner);
}
