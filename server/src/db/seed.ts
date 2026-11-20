import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { pool, withTransaction } from "./pool.js";
import { seedGames } from "./seedGames.js";

if (env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

const BCRYPT_COST = 12;
const POSITIONS = ["PG", "SG", "SF", "PF", "C", "ANY"] as const;

const PLAYER_NAMES = [
  "Aisha Khan",
  "Ravi Kumar",
  "Kiran Reddy",
  "Sneha Rao",
  "Arjun Naidu",
  "Meera Iyer",
  "Rahul Verma",
  "Priya Sharma",
  "Vikram Singh",
  "Ananya Das",
  "Rohit Yadav",
  "Divya Menon",
  "Karthik Goud",
  "Nikhil Joshi",
  "Pooja Nair",
  "Sai Teja",
  "Harsha Vardhan",
  "Lakshmi Devi",
  "Imran Ali",
  "Fatima Begum",
  "Suresh Babu",
  "Tarun Gupta",
  "Neha Patel",
  "Varun Chowdary",
  "Manoj Kumar",
  "Bhavana Reddy",
  "Aditya Rao",
  "Shreya Pillai",
  "Faisal Ahmed",
  "Deepak Chand",
];

const COURTS = [
  {
    name: "KBR Park Court",
    address: "KBR Park, Jubilee Hills",
    area: "Jubilee Hills",
    lng: 78.4237,
    lat: 17.4219,
    surface: "OUTDOOR_CONCRETE",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Gachibowli Stadium Court",
    address: "GMC Balayogi Stadium, Gachibowli",
    area: "Gachibowli",
    lng: 78.349,
    lat: 17.4435,
    surface: "OUTDOOR_SYNTHETIC",
    lights: true,
    hoops: 4,
    approved: true,
  },
  {
    name: "LB Stadium Court",
    address: "LB Stadium, Basheer Bagh",
    area: "Basheer Bagh",
    lng: 78.4706,
    lat: 17.3995,
    surface: "OUTDOOR_CONCRETE",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Ameerpet Community Court",
    address: "Near Ameerpet Metro Station",
    area: "Ameerpet",
    lng: 78.4483,
    lat: 17.4375,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 2,
    approved: true,
  },
  {
    name: "Kondapur Sports Arena",
    address: "Kondapur Main Road",
    area: "Kondapur",
    lng: 78.365,
    lat: 17.46,
    surface: "INDOOR_WOODEN",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Madhapur Hoops Court",
    address: "Madhapur, Hitec City",
    area: "Madhapur",
    lng: 78.391,
    lat: 17.448,
    surface: "OUTDOOR_SYNTHETIC",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Banjara Hills Court",
    address: "Road No. 12, Banjara Hills",
    area: "Banjara Hills",
    lng: 78.4387,
    lat: 17.4126,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 1,
    approved: true,
  },
  {
    name: "Secunderabad Club Court",
    address: "Secunderabad Club, Secunderabad",
    area: "Secunderabad",
    lng: 78.4983,
    lat: 17.4399,
    surface: "OUTDOOR_CONCRETE",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Kukatpally Park Court",
    address: "KPHB Colony, Kukatpally",
    area: "Kukatpally",
    lng: 78.401,
    lat: 17.4948,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 2,
    approved: true,
  },
  {
    name: "Begumpet Court",
    address: "Begumpet, near Airport Road",
    area: "Begumpet",
    lng: 78.4676,
    lat: 17.444,
    surface: "OUTDOOR_SYNTHETIC",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Uppal Stadium Court",
    address: "Uppal Stadium Road",
    area: "Uppal",
    lng: 78.559,
    lat: 17.4058,
    surface: "OUTDOOR_CONCRETE",
    lights: true,
    hoops: 2,
    approved: true,
  },
  {
    name: "Dilsukhnagar Court",
    address: "Dilsukhnagar Main Road",
    area: "Dilsukhnagar",
    lng: 78.526,
    lat: 17.3688,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 1,
    approved: true,
  },
  {
    name: "Miyapur Metro Court",
    address: "Near Miyapur Metro Station",
    area: "Miyapur",
    lng: 78.359,
    lat: 17.4969,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 2,
    approved: false,
  },
  {
    name: "Tolichowki Court",
    address: "Tolichowki Main Road",
    area: "Tolichowki",
    lng: 78.413,
    lat: 17.398,
    surface: "OUTDOOR_CONCRETE",
    lights: false,
    hoops: 2,
    approved: false,
  },
];

type NewUser = {
  email: string;
  hash: string;
  name: string;
  role: "PLAYER" | "ADMIN";
  skill: number;
  position: string;
  area: string;
};

async function createUser(tx: PoolClient, u: NewUser): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, role, email_verified_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING id`,
    [u.email, u.hash, u.name, u.role],
  );
  const id = rows[0]!.id;

  await tx.query(
    `INSERT INTO player_profiles (user_id, skill_level, position, home_area)
     VALUES ($1, $2, $3, $4)`,
    [id, u.skill, u.position, u.area],
  );
  return id;
}

async function main() {
  const [adminHash, demoHash, playerHash] = await Promise.all([
    bcrypt.hash("Admin@12345", BCRYPT_COST),
    bcrypt.hash("Demo@12345", BCRYPT_COST),
    bcrypt.hash("Player@12345", BCRYPT_COST),
  ]);

  await withTransaction(async (tx) => {
    await tx.query("TRUNCATE users RESTART IDENTITY CASCADE");

    const adminId = await createUser(tx, {
      email: "admin@playbasketball.dev",
      hash: adminHash,
      name: "Admin",
      role: "ADMIN",
      skill: 3,
      position: "ANY",
      area: "Ameerpet",
    });

    await createUser(tx, {
      email: "demo@playbasketball.dev",
      hash: demoHash,
      name: "Demo Player",
      role: "PLAYER",
      skill: 3,
      position: "SG",
      area: "Ameerpet",
    });

    for (const [i, name] of PLAYER_NAMES.entries()) {
      await createUser(tx, {
        email: `player${String(i + 1).padStart(2, "0")}@example.com`,
        hash: playerHash,
        name,
        role: "PLAYER",
        skill: (i % 5) + 1,
        position: POSITIONS[i % POSITIONS.length]!,
        area: COURTS[i % 12]!.area,
      });
    }

    for (const c of COURTS) {
      await tx.query(
        `INSERT INTO courts
           (name, address, area, location, surface, has_lights, hoops_count,
            status, created_by, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326)::geography,
                 $6, $7, $8, $9, $10, $11, $12)`,
        [
          c.name,
          c.address,
          c.area,
          c.lng,
          c.lat,
          c.surface,
          c.lights,
          c.hoops,
          c.approved ? "APPROVED" : "PENDING",
          adminId,
          c.approved ? adminId : null,
          c.approved ? new Date() : null,
        ],
      );
    }
    await seedGames(tx);
  });

  console.log("Seeded: 32 users, 14 courts, 40 upcoming games, 5 completed, 2 cancelled.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
