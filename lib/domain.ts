import { z } from "zod";
import { planSong, vocalStyles } from "./song-planner";

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

export const compositionPlanSchema=z.object({titleSuggestions:z.array(z.string()),genre:z.string(),subgenres:z.array(z.string()),mood:z.array(z.string()),bpm:z.number().int().min(40).max(220),key:z.string(),scale:z.string(),timeSignature:z.string(),durationSeconds:z.number().int().min(1).max(600),instrumentation:z.array(z.object({instrument:z.string(),instrumentGroup:z.string().optional(),role:z.string(),character:z.string()})),tonalitySpecified:z.boolean().optional(),songIdea:z.string().optional(),styleDirection:z.string().optional(),vocal:z.object({gender:z.enum(["auto","male","female"]).optional(),enabled:z.boolean(),role:z.string().optional(),tone:z.string(),delivery:z.string()}),structure:z.array(z.object({type:z.string(),bars:z.number().int().positive(),energy:z.number().min(0).max(1),description:z.string()})),generationCaption:z.string(),negativeInstructions:z.array(z.string())});
export type CompositionPlan=z.infer<typeof compositionPlanSchema>;

export const coverModes=["EXACT","REIMAGINE"] as const;
export const coverArrangements=["FAITHFUL","REFRESH","NEW"] as const;
export const coverGenerationSchema=z.object({sourceSongId:z.string().uuid(),sourceVersionId:z.string().uuid().optional(),sourceAssetId:z.string().uuid().optional(),sourceTitle:z.string().trim().min(1).max(120).optional(),mode:z.enum(coverModes),arrangement:z.enum(coverArrangements).default("FAITHFUL"),sourceAdherence:z.number().int().min(0).max(100).default(82),styleInfluence:z.number().int().min(0).max(100).default(55),voiceIdentityStrength:z.number().int().min(0).max(100).default(100),rightsAttested:z.literal(true)});
export type CoverGeneration=z.infer<typeof coverGenerationSchema>;
export const vocalCastRoles=["LEAD","DUET","BACKGROUND"] as const;
export const vocalCastAssignmentSchema=z.object({section:z.string().trim().min(1).max(120),role:z.enum(vocalCastRoles).default("LEAD"),profileIds:z.array(z.string().uuid()).max(2).default([])});
export type VocalCastAssignment=z.infer<typeof vocalCastAssignmentSchema>;
export const createGenerationSchema=z.object({title:z.string().trim().min(1).max(120).optional(),prompt:z.string().trim().min(8).max(500),lyrics:z.string().max(10000).optional().default(""),instrumental:z.boolean().optional().default(false),genre:z.string().max(80).optional(),feel:z.string().trim().max(160).optional(),style:z.string().trim().max(500).optional(),vocalGender:z.enum(["auto","male","female"]).optional(),vocalStyle:z.enum(vocalStyles).optional(),bpm:z.number().int().min(40).max(220).optional(),key:z.string().max(20).optional(),scale:z.enum(["major","minor"]).optional(),durationSeconds:z.number().int().min(1).max(600).optional().default(12),seed:z.number().int().nonnegative().optional(),outputMode:z.enum(["MASTER_ONLY","MULTI_ASSET"]).optional().default("MASTER_ONLY"),providerPolicyAccepted:z.boolean().optional(),providerOptions:z.record(z.string(),z.json()).optional().default({}),vocalProfileId:z.string().uuid().nullable().optional(),vocalCast:z.array(vocalCastAssignmentSchema).max(32).default([]),cover:coverGenerationSchema.optional()}).superRefine((value,context)=>{const sections=new Set<string>();for(const assignment of value.vocalCast){const key=assignment.section.toLowerCase();if(sections.has(key))context.addIssue({code:z.ZodIssueCode.custom,message:"Each lyric section can only have one cast assignment.",path:["vocalCast"]});sections.add(key);if(assignment.role==="DUET"&&assignment.profileIds.length!==2)context.addIssue({code:z.ZodIssueCode.custom,message:"A duet needs two private vocalists.",path:["vocalCast"]});if(assignment.role!=="DUET"&&assignment.profileIds.length>1)context.addIssue({code:z.ZodIssueCode.custom,message:"A solo or background section can have one private vocalist.",path:["vocalCast"]})}});
export type CreateGeneration=z.infer<typeof createGenerationSchema>;
export function validateGeneration(input:unknown){return createGenerationSchema.parse(input)}

export type GenerationRequest={jobId:string;userId:string;songId:string;versionId:string;compositionPlan:CompositionPlan;lyrics?:string;seed:number;outputMode:"MASTER_ONLY"|"MULTI_ASSET";providerOptions?:Record<string,unknown>};
export type CoverReference={sourceAssetId:string;sourceTitle:string;sourceAudio:Uint8Array;sourceMimeType:string;sourceDurationSeconds:number;arrangement:CoverGeneration["arrangement"];sourceAdherence:CoverGeneration["sourceAdherence"];styleInfluence:CoverGeneration["styleInfluence"]};
export type GeneratedAudio={bytes?:Uint8Array;sourceUrl?:string};
export type GeneratedAsset={assetKey:string;role:AudioAssetRole;instrument?:string;instrumentGroup?:string;provenance:GenerationProvenance;isPrimary:boolean;sortOrder:number;sourceAssetId?:string;audio:GeneratedAudio;metadata:{mimeType:string;codec:string;sampleRate:number;bitDepth:number;channels:number;durationSeconds:number;checksum?:string;waveformData?:number[]};providerMetadata?:Record<string,unknown>};
export type GenerationResult={assets:GeneratedAsset[];providerMetadata?:Record<string,unknown>};
export const contextualTrackGenerationSchema=z.object({sourceAssetId:z.string().uuid(),targetInstrumentGroup:z.enum(contextualTrackTargets),seed:z.number().int().nonnegative().optional(),providerOptions:z.record(z.string(),z.unknown()).optional()});
export type ContextualTrackGenerationInput=z.infer<typeof contextualTrackGenerationSchema>;
export type ContextualTrackGenerationRequest=ContextualTrackGenerationInput&{jobId:string;userId:string;songId:string;versionId:string;sourceAudio:Uint8Array;sourceMimeType:string;caption:string};
export type ProviderHealth={available:boolean;latencyMs:number;message:string};
export type CapabilityMaturity="UNAVAILABLE"|"DEVELOPMENT"|"EXPERIMENTAL"|"PRODUCTION";
export type ProviderCapabilities={textToMusic:boolean;lyrics:boolean;referenceAudio:boolean;continuation:boolean;repaint:boolean;stems:boolean;nativeMultitrack:boolean;masterGeneration:CapabilityMaturity;contextualRegeneration:CapabilityMaturity;sourceSeparation:CapabilityMaturity;bpmControl:boolean;keyControl:boolean;seed:boolean};

export function compose(request:CreateGeneration):CompositionPlan { return compositionPlanSchema.parse(planSong(request)); }
