import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
const clients=new Set<ReturnType<typeof postgres>>();
export function getSql(databaseUrl?:string){const url=databaseUrl||process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL_REQUIRED");const client=postgres(url,{max:2,prepare:false,idle_timeout:5,max_lifetime:60});clients.add(client);return client}
export function getDb(){return drizzle(getSql(),{schema})}
export async function closeDb(){await Promise.all([...clients].map(client=>client.end()));clients.clear()}
