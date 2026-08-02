import { createHash } from 'node:crypto';

const flights = new Map();

function keyFor(url) {
  return createHash('sha256').update(url).digest('hex');
}

function waitMs() {
  const value = Number(process.env.RENDER_SINGLE_FLIGHT_WAIT_MS);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1_000), 60_000) : 30_000;
}

function waitForFlight(promise) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ completed: false, value: null });
    }, waitMs());
    timer.unref?.();

    promise.then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ completed: true, value });
    });
  });
}

export function joinRenderFlight(url) {
  const key = keyFor(url);
  const existing = flights.get(key);
  if (existing) {
    return {
      leader: false,
      wait: () => waitForFlight(existing.promise),
    };
  }

  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  const flight = { promise };
  flights.set(key, flight);
  let completed = false;
  return {
    leader: true,
    complete(value = null) {
      if (completed) return;
      completed = true;
      if (flights.get(key) === flight) flights.delete(key);
      resolve(value);
    },
  };
}

export function activeRenderFlights() {
  return flights.size;
}

export function resetRenderFlightsForTests() {
  for (const flight of flights.values()) flight.promise.catch(() => {});
  flights.clear();
}
