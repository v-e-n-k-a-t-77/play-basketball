import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTransaction } from "../../src/db/pool.js";

describe("withTransaction", () => {
    beforeAll(async () => {
        await pool.query("DROP TABLE IF EXISTS tx_scratch");
        await pool.query("CREATE TABLE tx_scratch (id serial PRIMARY KEY, name text NOT NULL)")
    });

    afterAll(async () => {
        await pool.query("DROP TABLE IF EXISTS tx_scratch");
        await pool.end();
    });

    it("commits when the function succeeds", async () => {
        await withTransaction(async (tx) => {
            await tx.query("INSERT INTO tx_scratch (name) VALUES ($1)", ["committed"]);
        });

        const { rows } = await pool.query("SELECT name FROM tx_scratch WHERE name = $1", ["committed"]);
        expect(rows).toHaveLength(1);
    });

    it("rolls back when the function throws", async() => {
        await expect(
            withTransaction(async (tx) => {
                await tx.query("INSERT INTO tx_scratch (name) VALUES ($1)", ["rolled-back"]);
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");

        const { rows } = await pool.query("SELECT name FROM tx_scratch WHERE name = $1", ["rolled-back",]);
        expect(rows).toHaveLength(0);
    });
});