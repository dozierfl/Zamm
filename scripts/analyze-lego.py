"""Deterministic first-pass metrics for ACE-Step Lego R&D WAV files."""
import json, math, sys, wave
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate, find_peaks

def load(path):
    sr,y=wavfile.read(path);scale=float(np.iinfo(y.dtype).max) if np.issubdtype(y.dtype,np.integer) else 1.0;y=y.astype(np.float64)/scale;y=y[:,None] if y.ndim==1 else y;return y.T,sr
def audio_metrics(path):
    y,sr=load(path);mono=np.mean(y,axis=0);peak=float(np.max(np.abs(mono)));rms=float(np.sqrt(np.mean(mono**2)));threshold=10**(-60/20);active=np.flatnonzero(np.abs(mono)>threshold)
    leading=(active[0]/sr*1000) if active.size else len(mono)/sr*1000;trailing=((len(mono)-1-active[-1])/sr*1000) if active.size else len(mono)/sr*1000
    hop=max(1,sr//200);frames=np.array([np.sqrt(np.mean(mono[i:i+hop]**2)) for i in range(0,len(mono),hop)]);flux=np.maximum(0,np.diff(frames,prepend=frames[0]));peaks,_=find_peaks(flux,distance=max(1,int(0.25*200)),prominence=max(np.std(flux),1e-9));onsets=peaks/200
    ac=correlate(flux-np.mean(flux),flux-np.mean(flux),mode="full")[len(flux)-1:];lo,hi=int(200*60/100),int(200*60/50);lag=lo+int(np.argmax(ac[lo:min(hi,len(ac))]));tempo=60*200/lag if lag else 0
    keys=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];freqs=np.fft.rfftfreq(len(mono),1/sr);spec=np.abs(np.fft.rfft(mono));valid=(freqs>=55)&(freqs<=1760);midi=np.rint(69+12*np.log2(freqs[valid]/440)).astype(int);profile=np.bincount(np.mod(midi,12),weights=spec[valid],minlength=12);key=keys[int(np.argmax(profile))]
    spectrum=np.abs(np.fft.rfft(mono));freq=np.fft.rfftfreq(len(mono),1/sr);power=spectrum**2;total=float(np.sum(power)) or 1
    return{"file":str(path),"durationSeconds":len(mono)/sr,"sampleRate":sr,"channels":y.shape[0],"sampleCount":len(mono),"peakDbfs":20*math.log10(max(peak,1e-12)),"rmsDbfs":20*math.log10(max(rms,1e-12)),"crestFactorDb":20*math.log10(max(peak,1e-12)/max(rms,1e-12)),"dcOffset":float(np.mean(mono)),"clippingCount":int(np.sum(np.abs(y)>=0.999969)),"leadingSilenceMs":leading,"trailingSilenceMs":trailing,"estimatedTempoBpm":tempo,"estimatedKeyPitchClass":key,"onsetsSeconds":[round(float(x),4) for x in onsets],"bandEnergyRatios":{"subBassBelow120Hz":float(np.sum(power[freq<120])/total),"mid120To5000Hz":float(np.sum(power[(freq>=120)&(freq<5000)])/total),"highAbove5000Hz":float(np.sum(power[freq>=5000])/total)}}
def alignment(source,output):
    sy,sr=load(source);oy,orr=load(output);s=np.mean(sy,axis=0);o=np.mean(oy,axis=0);target=200;hop=max(1,sr//target);sh=np.array([np.sqrt(np.mean(s[i:i+hop]**2)) for i in range(0,len(s),hop)]);hop=max(1,orr//target);oh=np.array([np.sqrt(np.mean(o[i:i+hop]**2)) for i in range(0,len(o),hop)]);n=min(len(sh),len(oh));sh=(sh[:n]-np.mean(sh[:n]))/(np.std(sh[:n])+1e-9);oh=(oh[:n]-np.mean(oh[:n]))/(np.std(oh[:n])+1e-9);c=correlate(oh,sh,mode="full");lag=int(np.argmax(c)-(n-1));return{"estimatedEnvelopeOffsetMs":lag/target*1000,"maxNormalizedEnvelopeCorrelation":float(np.max(c)/n)}
source=audio_metrics(sys.argv[1]);results={"source":source,"outputs":[]}
for name in sys.argv[2:]:
    item=audio_metrics(name);item["alignment"]={"durationDeltaMs":(item["durationSeconds"]-source["durationSeconds"])*1000,"sampleCountDelta":item["sampleCount"]-source["sampleCount"],"sampleRateDifference":item["sampleRate"]-source["sampleRate"],"tempoDeltaBpm":item["estimatedTempoBpm"]-source["estimatedTempoBpm"],**alignment(sys.argv[1],name)};results["outputs"].append(item)
rendered=json.dumps(results,indent=2);Path("artifacts/acestep-lego").mkdir(parents=True,exist_ok=True);Path("artifacts/acestep-lego/results.json").write_text(rendered+"\n");print(rendered)
