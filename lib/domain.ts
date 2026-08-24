import { z } from "zod";

export const generationStatuses=["QUEUED","PREPARING","GENERATING","POST_PROCESSING","UPLOADING","COMPLETE","FAILED","CANCELLED"] as const;
export type GenerationStatus=(typeof generationStatuses)[number];
export const audioAssetRoles=["MASTER","PREMASTER","NATIVE_TRACK","DERIVED_STEM","EFFECT_RETURN","ALTERNATIVE","REFERENCE","UPLOAD"] as const;
export type AudioAssetRole=(typeof audioAssetRoles)[number];
export const generationProvenances=["GENERATED_NATIVE","SEPARATED","RENDERED","UPLOADED","REFERENCE","DERIVED"] as const;
export type GenerationProvenance=(typeof generationProvenances)[number];
export const trackGenerationMethods=["FULL_SONG","LEGO_CONTEXTUAL","EXTRACT","COMPLETE","SEPARATION","UPLOAD"] as const;
export type TrackGenerationMethod=(typeof trackGenerationMethods)[number];
export const contextualTrackTargets=["woodwinds","brass","fx","synth","strings","percussion","keyboard","guitar","bass","drums","backing_vocals","vocals"] as const;
export type ContextualTrackTarget=(typeof contextualTrackTargets)[number];

export const compositionPlanSchema=z.object({titleSuggestions:z.array(z.string()),genre:z.string(),subgenres:z.array(z.string()),mood:z.array(z.string()),bpm:z.number().int().min(40).max(220),key:z.string(),scale:z.string(),timeSignature:z.string(),durationSeconds:z.number().int().min(1).max(600),instrumentation:z.array(z.object({instrument:z.string(),instrumentGroup:z.string().optional(),role:z.string(),character:z.string()})),vocal:z.object({enabled:z.boolean(),role:z.string().optional(),tone:z.string(),delivery:z.string()}),structure:z.array(z.object({type:z.string(),bars:z.number().int().positive(),energy:z.number().min(0).max(1),description:z.string()})),generationCaption:z.string(),negativeInstructions:z.array(z.string())});
export type CompositionPlan=z.infer<typeof compositionPlanSchema>;

export const createGenerationSchema=z.object({prompt:z.string().trim().min(8).max(500),lyrics:z.string().max(10000).optional().default(""),instrumental:z.boolean().optional().default(false),genre:z.string().max(80).optional(),bpm:z.number().int().min(40).max(220).optional(),key:z.string().max(20).optional(),durationSeconds:z.number().int().min(1).max(60).optional().default(12),seed:z.number().int().nonnegative().optional(),outputMode:z.enum(["MASTER_ONLY","MULTI_ASSET"]).optional().default("MASTER_ONLY")});
export type CreateGeneration=z.infer<typeof createGenerationSchema>;
export function validateGeneration(input:unknown){return createGenerationSchema.parse(input)}

export type GenerationRequest={jobId:string;userId:string;songId:string;versionId:string;compositionPlan:CompositionPlan;lyrics?:string;seed:number;outputMode:"MASTER_ONLY"|"MULTI_ASSET";providerOptions?:Record<string,unknown>};
export type GeneratedAudio={bytes?:Uint8Array;sourceUrl?:string};
export type GeneratedAsset={assetKey:string;role:AudioAssetRole;instrument?:string;instrumentGroup?:string;provenance:GenerationProvenance;isPrimary:boolean;sortOrder:number;audio:GeneratedAudio;metadata:{mimeType:string;codec:string;sampleRate:number;bitDepth:number;channels:number;durationSeconds:number;checksum?:string;waveformData?:number[]};providerMetadata?:Record<string,unknown>};
export type GenerationResult={assets:GeneratedAsset[];providerMetadata?:Record<string,unknown>};
export const contextualTrackGenerationSchema=z.object({sourceAssetId:z.string().uuid(),targetInstrumentGroup:z.enum(contextualTrackTargets),seed:z.number().int().nonnegative().optional(),providerOptions:z.record(z.string(),z.unknown()).optional()});
export type ContextualTrackGenerationInput=z.infer<typeof contextualTrackGenerationSchema>;
export type ContextualTrackGenerationRequest=ContextualTrackGenerationInput&{jobId:string;userId:string;songId:string;versionId:string;sourceAudio:Uint8Array;sourceMimeType:string;caption:string};
export type ProviderHealth={available:boolean;latencyMs:number;message:string};
export type CapabilityMaturity="UNAVAILABLE"|"DEVELOPMENT"|"EXPERIMENTAL"|"PRODUCTION";
export type ProviderCapabilities={textToMusic:boolean;lyrics:boolean;referenceAudio:boolean;continuation:boolean;repaint:boolean;stems:boolean;nativeMultitrack:boolean;masterGeneration:CapabilityMaturity;contextualRegeneration:CapabilityMaturity;sourceSeparation:CapabilityMaturity;bpmControl:boolean;keyControl:boolean;seed:boolean};

export function compose(request:CreateGeneration):CompositionPlan{const p=request.prompt.toLowerCase(),genre=request.genre||(p.includes("soul")?"Neo-soul":p.includes("jazz")?"Contemporary jazz":p.includes("rock")?"Alternative rock":"Alternative pop"),bpm=request.bpm||(p.includes("slow")||p.includes("reflective")?72:p.includes("dance")?118:84),key=request.key||(p.includes("bright")?"A":"F#"),mood=[p.includes("warm")?"Warm":"Intimate",p.includes("purpose")?"Hopeful":"Reflective"];return compositionPlanSchema.parse({titleSuggestions:[p.includes("purpose")?"Purpose Finds Us Late":request.prompt.split(/\s+/).slice(0,4).map(w=>w[0]?.toUpperCase()+w.slice(1)).join(" ")],genre,subgenres:p.includes("soul")?["alternative R&B"]:[],mood,bpm,key,scale:p.includes("bright")?"major":"minor",timeSignature:"4/4",durationSeconds:request.durationSeconds,instrumentation:[{instrument:"Rhodes",instrumentGroup:"MUSIC",role:"harmonic bed",character:"warm and restrained"},{instrument:"Pocket drums",instrumentGroup:"DRUMS",role:"groove",character:"human and spacious"},{instrument:"Electric bass",instrumentGroup:"MUSIC",role:"low-end movement",character:"round and melodic"}],vocal:{enabled:!request.instrumental,role:"LEAD",tone:"intimate and textured",delivery:"conversational verses, open chorus"},structure:[{type:"intro",bars:4,energy:.2,description:"Sparse harmonic motif"},{type:"verse",bars:8,energy:.45,description:"Patient narrative development"},{type:"chorus",bars:8,energy:.78,description:"Wider harmony and stronger drums"},{type:"outro",bars:4,energy:.3,description:"Resolve to opening motif"}],generationCaption:`${genre}, ${bpm} BPM, ${key} ${p.includes("bright")?"major":"minor"}, ${mood.join(" and ")}`,negativeInstructions:["harsh limiting","abrupt ending","undifferentiated loop"]})}
