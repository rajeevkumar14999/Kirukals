/**
 * There is no script sync.
 *
 * This file used to push whole screenplays to Postgres on every save. It does
 * not any more, and the emptiness is the point: a script is a file on the
 * writer's own machine, and the account exists to know who somebody is and
 * that they have paid.
 *
 * Kept as a file rather than deleted so that the next person to wonder "where
 * did the sync go" finds this instead of nothing.
 *
 * If cloud storage of scripts is ever wanted, it should not look like what was
 * here. Sending four hundred kilobytes of document every time somebody pauses
 * typing wastes 99.99% of what it sends; the shape that works is a delta, or a
 * blob in object storage with the database holding only the index of it.
 */
export {};
