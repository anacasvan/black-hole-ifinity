import type { Settings } from './state';
export class SoundManager {
 private audio:AudioContext|null=null;
 private master:GainNode|null=null;
 private lastBeep=0;
 constructor(private settings:Settings){}
 async resume(){try{if(!this.audio){this.audio=new AudioContext();this.master=this.audio.createGain();this.master.gain.value=0;this.master.connect(this.audio.destination);[110,164.81,220,329.63].forEach((freq,i)=>{const oscillator=this.audio!.createOscillator();const gain=this.audio!.createGain();gain.gain.value=i===0?.09:.035;oscillator.frequency.value=freq;oscillator.type='sine';oscillator.connect(gain).connect(this.master!);oscillator.start()})}if(this.audio.state==='suspended')await this.audio.resume();this.updateSettings(this.settings)}catch{/* Audio non supportato */}}
 updateSettings(settings:Settings){this.settings=settings;if(this.master&&this.audio)this.master.gain.setTargetAtTime(settings.music?settings.volume*.34:0,this.audio.currentTime,.2)}
 effect(milestone=false){if(!this.settings.effects||!this.audio||this.audio.state!=='running')return;const now=this.audio.currentTime;if(!milestone&&now-this.lastBeep<.055)return;this.lastBeep=now;const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();oscillator.type='sine';const freq=milestone?440:265+Math.random()*160;oscillator.frequency.setValueAtTime(freq,now);oscillator.frequency.exponentialRampToValueAtTime(milestone?660:freq*.55,now+.16);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime((milestone?.08:.045)*this.settings.volume,now+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+.27);oscillator.connect(gain).connect(this.audio.destination);oscillator.start(now);oscillator.stop(now+.28)}
}
