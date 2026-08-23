import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
const clients=new Map<string,ReturnType<typeof postgres>>();
export function getSql(databaseUrl?:string){const url=databaseUrl||process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL_REQUIRED");let client=clients.get(url);if(!client){client=postgres(url,{max:5,prepare:false});clients.set(url,client)}return client}
export function getDb(){return drizzle(getSql(),{schema})}
export async function closeDb(){await Promise.all([...clients.values()].map(client=>client.end()));clients.clear()}
