"""Deterministic, original procedural art for Black Hole Infinity.
Requires pillow, numpy, scipy. The generated artwork is bundled and requires no network at runtime."""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy.ndimage import zoom, gaussian_filter
from pathlib import Path
import math, random
ROOT=Path(__file__).resolve().parent/'assets';ROOT.mkdir(exist_ok=True)
R=np.random.default_rng(4263)
def noise(w,h,scales=(8,22,60,170),weights=(.52,.26,.15,.07)):
    out=np.zeros((h,w),dtype=np.float32)
    for s,a in zip(scales,weights):
        r=R.random((max(2,h//s+2),max(2,w//s+2)),dtype=np.float32)
        f=zoom(r,(h/r.shape[0],w/r.shape[1]),order=3)
        out+=a*f[:h,:w]
    return (out-out.min())/(out.max()-out.min()+1e-8)
def savearr(a,name,mode='RGB'):
    Image.fromarray(np.uint8(np.clip(a,0,255)),mode).save(ROOT/name,optimize=True)
N=1024
y,x=np.mgrid[:N,:N]
base=noise(N,N,(180,80,32,7),(.39,.32,.22,.07));fine=noise(N,N,(9,3,1,1),(.4,.2,.1,.0));h=base*.8+fine*.2
terrain=np.stack((65+h*40,88+h*48,57+h*26),-1)
# patchy dry soil / moss; muted aerial drone grading
soil=np.maximum(0,np.sin(x*.009+.9)*np.cos(y*.011)+base-.83)*.85
terrain+=soil[...,None]*np.array([64,42,16])
terrain+=(R.normal(0,4,(N,N)))[...,None]
img=Image.fromarray(np.uint8(np.clip(terrain,0,255)),'RGB').convert('RGBA')
d=ImageDraw.Draw(img,'RGBA')
# modest paved paths and streets, each path repeats every 512 px
for v in (2,514):
    d.rectangle((v-47,0,v+45,N),fill=(36,45,45,255));d.rectangle((0,v-47,N,v+45),fill=(36,45,45,255))
    d.rectangle((v-53,0,v-45,N),fill=(158,148,127,255));d.rectangle((v+45,0,v+54,N),fill=(163,150,131,255))
    d.rectangle((0,v-53,N,v-45),fill=(151,146,129,255));d.rectangle((0,v+45,N,v+53),fill=(151,146,129,255))
    for n in range(0,N,48):
        d.line((v,n+8,v,n+31),fill=(218,199,140,200),width=2)
        d.line((n+8,v,n+31,v),fill=(218,199,140,200),width=2)
# paths around park and irregular patches
for i in range(70):
    a=int(R.integers(45,990));b=int(R.integers(45,990));r=int(R.integers(4,26))
    if 490<a<550 or 490<b<550:continue
    c=(43,80,40,int(R.integers(22,90))) if i%3 else (133,113,72,65)
    d.ellipse((a-r,b-r//2,a+r,b+r//2),fill=c)
for i in range(1100):
    a=int(R.integers(0,N));b=int(R.integers(0,N));r=int(R.integers(1,4))
    if min(abs(a-514),abs(b-514),a,b)<54:continue
    d.ellipse((a-r,b-r,a+r,b+r),fill=(24,64,31,int(R.integers(15,100))))
img=img.filter(ImageFilter.GaussianBlur(.42));img.convert('RGB').save(ROOT/'terrain.jpg',quality=86,subsampling=0)
# orbital ocean/continent topographic map
n1=noise(N,N,(260,110,50,15),(.51,.28,.15,.06));coast=n1+.09*np.sin(x*.004)+.06*np.cos(y*.006);land=coast>.54
hmap=np.stack((12+coast*40,53+coast*66,93+coast*68),-1)
elev=np.clip((coast-.51)*2.5,0,1)
hmap[land]=np.stack((33+elev*106,68+elev*90,45+elev*50),-1)[land]
shallow=(coast>.48)&(~land);hmap[shallow]+=np.array([20,48,40])
cloud=noise(N,N,(140,70,27,7),(.48,.26,.18,.08))
hmap+=np.maximum(0,cloud-.62)[...,None]*np.array([300,290,280]);hmap+=R.normal(0,3,(N,N))[...,None]
savearr(hmap,'orbit.jpg')
# spatial starfield + wispy clouds, each color scheme
for stage,palette in enumerate([((30,80,117),(79,53,92)),((99,48,127),(17,96,144)),((101,47,113),(38,61,141)),((62,89,142),(124,60,115))]):
    n=noise(N,N,(230,120,52,16),(.48,.31,.16,.05));n2=noise(N,N,(350,180,65,20),(.50,.27,.17,.06))
    yy,xx=np.mgrid[:N,:N];fade=gaussian_filter(np.maximum(0,n-.45)**2,5)*13
    cloudy=np.clip((n-.40)*1.8,0,1)**2.4
    luminous=np.clip((n2-.48)*2.6,0,1)**2.2
    arr=np.zeros((N,N,3),dtype=np.float32)
    arr+=np.array([5,10,23]);arr+=cloudy[...,None]*np.array(palette[0])*.89;arr+=luminous[...,None]*np.array(palette[1])*.8
    arr+=np.clip(n-.63,0,1)[...,None]*np.array([66,84,91])
    stars=np.argwhere(R.random((N,N))>.9983)
    arr=arr.clip(0,255)
    sp=Image.fromarray(arr.astype('uint8'),'RGB');dd=ImageDraw.Draw(sp,'RGBA')
    for sy,sx in stars:
        b=int(R.integers(145,255));rr=R.choice([0.5,0.7,1,1.5,2],p=[.1,.32,.42,.13,.03]);rr=float(rr)
        dd.ellipse((sx-rr,sy-rr,sx+rr,sy+rr),fill=(b,b+int((255-b)*.7),255,int(R.integers(105,245))))
        if rr>1.3:
            dd.line((sx-4,sy,sx+4,sy),fill=(191,214,255,50),width=1)
    sp.save(ROOT/f'nebula{stage}.jpg',quality=84,subsampling=0)
# sphere textures, physical-ish directional lighting and pixel-space material variation
S=352; yy,xx=np.mgrid[:S,:S];cx=(S-1)/2;cy=cx;px=(xx-cx)/(S*.407);py=(yy-cy)/(S*.407);rr=px**2+py**2
mask=rr<=1;z=np.sqrt(np.maximum(0,1-rr));light=np.maximum(.0,(px*(-.53)+py*(-.46)+z*.76)/np.sqrt(.53**2+.46**2+.76**2));shade=(.16+.84*light**.90);limb=np.clip(z/.19,0,1)**.5
sphereNoise=noise(S,S,(95,34,12,3),(.45,.31,.17,.07));distort=noise(S,S,(120,50,14,3),(.48,.29,.16,.07));clouds=noise(S,S,(84,36,13,4),(.46,.28,.19,.07))
def planet(name,base,style):
    if style=='earth':
        v=sphereNoise+.12*np.sin(xx*.036)+.05*np.cos(yy*.058); land=v>.53
        rgb=np.broadcast_to(np.array([16,83,148.]),(S,S,3)).copy()
        rgb[land]=np.array([60,113,69])+(v[land]-.53)[:,None]*np.array([190,170,115]);rgb+=np.maximum(0,clouds-.61)[...,None]*np.array([440,420,395])
    elif style=='gas':
        stripe=.6+.18*np.sin(yy*.13+distort*6)+.15*np.sin(yy*.037+distort*3)
        rgb=np.array(base)[None,None,:]*(.67+stripe[...,None]*.5)
        spot=((xx-S*.62)/38)**2+((yy-S*.60)/23)**2<1
        rgb=rgb.copy();rgb[spot]=[171,91,58]
    elif style=='saturn':
        stripe=.72+.12*np.sin(yy*.17+distort*7)+.08*np.cos(yy*.075)
        rgb=np.array(base)[None,None,:]*(.65+stripe[...,None]*.47)
    elif style=='rock':
        rgb=np.array(base)[None,None,:]*(.52+sphereNoise[...,None]*.89)
        crater=((xx-150)**2+(yy-120)**2)**.5
        rgb=rgb.copy();rgb[(crater>21)&(crater<25)]*=1.18;rgb[crater<19]*=.79
        for xo,yo,rad in [(235,210,18),(131,235,16),(210,103,8)]:
            radmap=np.sqrt((xx-xo)**2+(yy-yo)**2)
            rgb[radmap<rad]*=.87;rgb[(radmap>rad)&(radmap<rad+3)]*=1.1
    elif style=='sun':
        rgb=np.broadcast_to(np.array(base),(S,S,3)).copy()*(.84+distort[...,None]*.34)
    elif style=='mars':
        rgb=np.array(base)[None,None,:]*(.56+sphereNoise[...,None]*.89)
        rgb=rgb.copy();rgb+=np.maximum(0,distort-.52)[...,None]*np.array([44,-32,-19])
    elif style=='ice':
        rgb=np.array(base)[None,None,:]*(.68+.46*np.sin(yy*.056+distort*3)[...,None]**2)
    else:
        rgb=np.array(base)[None,None,:]*(.65+sphereNoise[...,None]*.7)
    rgb=np.clip(rgb*shade[...,None],0,255)
    alpha=np.uint8(np.clip(mask*limb*255,0,255));rgba=np.concatenate([rgb,alpha[...,None]],axis=-1).astype('uint8')
    image=Image.fromarray(rgba,'RGBA');image.save(ROOT/f'{name}.png',optimize=True)
for name,base,style in [
('earth',[17,87,160],'earth'),('moon',[175,175,168],'rock'),('mercury',[152,141,125],'rock'),('mars',[197,94,62],'mars'),('jupiter',[190,139,104],'gas'),('saturn',[202,178,135],'saturn'),('neptune',[63,109,201],'ice'),('sun',[255,198,83],'sun'),('asteroid',[138,127,116],'rock')]:planet(name,base,style)
# Art sprites, detailed shaded shapes with soft cast shadows at 256x256
M=256;Z=4;C=128

def glyph(name,paint):
    spr=Image.new('RGBA',(M,M),(0,0,0,0));shadow=Image.new('RGBA',(M,M),(0,0,0,0));sd=ImageDraw.Draw(shadow,'RGBA');sd.ellipse((45,171,222,222),fill=(4,8,14,120));shadow=shadow.filter(ImageFilter.GaussianBlur(14));spr.alpha_composite(shadow)
    d=ImageDraw.Draw(spr,'RGBA');paint(d,spr)
    spr.save(ROOT/f'{name}.png',optimize=True)
def tree(d,im):
    d.polygon([(112,129),(124,64),(141,60),(139,129),(163,173),(142,177),(125,133),(106,167),(87,158)],fill=(90,59,38,255))
    for sx,sy,r,clr in [(93,107,43,(37,77,43)),(146,83,48,(49,109,57)),(121,117,49,(48,114,57)),(104,62,33,(69,132,62)),(165,113,33,(57,119,58)),(110,98,30,(81,151,67))]:
        d.ellipse((sx-r,sy-r,sx+r,sy+r),fill=clr+(255,))
    for i in range(240):
        x=int(R.integers(57,192));y=int(R.integers(35,159));size=int(R.integers(1,4));
        if ((x-120)/74)**2+((y-93)/68)**2<1:d.ellipse((x,y,x+size,y+size),fill=(130,176,78,int(R.integers(90,220))))
glyph('tree',tree)
def car(d,im):
    d.rounded_rectangle((45,88,220,162),14,fill=(20,25,33,255));d.rounded_rectangle((40,82,214,151),18,fill=(167,42,48,255));d.rounded_rectangle((70,91,166,137),12,fill=(32,51,64,255));d.polygon([(78,96),(122,93),(115,128),(73,130)],fill=(92,130,141,255));d.rounded_rectangle((55,145,93,151),3,fill=(245,197,152,255));d.rounded_rectangle((175,84,204,92),3,fill=(245,210,140,255));d.line((61,87,199,87),fill=(237,115,100,255),width=5);d.line((65,151,193,151),fill=(71,29,35,255),width=4)
glyph('vehicle',car)
def house(d,im):
    d.polygon([(47,87),(145,57),(214,88),(212,186),(66,207)],fill=(82,74,61,255));d.polygon([(47,87),(145,57),(216,88),(128,121)],fill=(191,92,72,255));d.polygon([(48,88),(128,122),(128,206),(64,185)],fill=(162,153,129,255));d.polygon([(128,122),(215,88),(212,188),(128,206)],fill=(114,111,103,255));
    for xx,yy in [(82,137),(154,135),(176,115)]:d.rectangle((xx,yy,xx+22,yy+28),fill=(41,64,79,255));d.line((xx+2,yy+3,xx+16,yy+3),fill=(159,199,205,255),width=3)
    for j in range(5):d.line((64+j*27,86+j*0,100+j*18,106),fill=(125,57,50,70),width=2)
glyph('house',house)
def tower(d,im):
    d.polygon([(76,79),(159,45),(206,75),(119,111)],fill=(149,173,176,255));d.polygon([(76,79),(119,111),(119,222),(77,187)],fill=(64,84,100,255));d.polygon([(119,111),(206,75),(204,189),(119,222)],fill=(89,112,126,255));
    for floor in range(7):
        sy=119+floor*13
        for col in range(3):
            xx=130+col*22; yy=sy-col*8
            d.polygon([(xx,yy),(xx+14,yy-5),(xx+14,yy+5),(xx,yy+10)],fill=(181,211,216,180) if (floor+col)%3 else (247,205,126,230))
glyph('tower',tower)
def nature(d,im):
    d.ellipse((82,60,166,193),fill=(77,140,65,255));d.ellipse((100,82,162,158),fill=(119,174,87,255));d.arc((86,66,161,190),50,220,fill=(38,88,46,240),width=5);d.line((122,185,138,65),fill=(43,97,45,255),width=4)
glyph('nature',nature)
def flower(d,im):
    for k in range(9):
        a=k*math.tau/9;xx=130+40*math.cos(a);yy=125+40*math.sin(a);d.ellipse((xx-26,yy-34,xx+26,yy+34),fill=(196,114,139,255));d.ellipse((xx-18,yy-23,xx+18,yy+23),fill=(240,167,166,185))
    d.ellipse((105,101,153,149),fill=(231,193,101,255));
    for k in range(20):
        a=R.random()*math.tau;rr=R.random()*17;x=129+rr*math.cos(a);y=125+rr*math.sin(a);d.ellipse((x-2,y-2,x+2,y+2),fill=(95,73,38,180))
glyph('flower',flower)
def stone(d,im):
    d.polygon([(46,155),(80,79),(148,58),(213,117),(181,187),(86,201)],fill=(73,78,73,255));d.polygon([(80,79),(148,58),(177,105),(119,145),(46,155)],fill=(135,136,125,255));d.polygon([(119,145),(177,105),(213,117),(181,187),(86,201)],fill=(93,97,90,255));d.line((88,105,119,145),fill=(185,178,159,155),width=4)
glyph('stone',stone)
def furniture(d,im):
    d.polygon([(58,95),(200,95),(212,120),(70,125)],fill=(133,91,51,255));d.polygon([(62,133),(205,128),(205,149),(60,154)],fill=(158,108,61,255));
    for sy in (102,109,141):d.line((70,sy,195,sy-3),fill=(211,165,105,255),width=5)
    d.line((77,151,76,190),fill=(89,87,83,255),width=9);d.line((193,143,195,179),fill=(76,77,79,255),width=9)
glyph('furniture',furniture)
def satellite(d,im):
    d.polygon([(104,93),(156,93),(155,158),(105,158)],fill=(174,175,174,255));d.polygon([(104,93),(139,73),(179,87),(156,93)],fill=(223,223,213,255))
    for xx in (24,177):
        d.rectangle((xx,98,xx+56,155),fill=(30,56,105,255))
        for k in range(3):d.line((xx+4+k*16,102,xx+4+k*16,150),fill=(103,147,197,200),width=2)
    d.line((124,76,131,51),fill=(213,215,210,255),width=4);d.ellipse((118,43,139,61),fill=(172,182,202,255))
glyph('satellite',satellite)
# Draw galaxy with transparent additive-ish glow and spiral arm stars
spr=Image.new('RGBA',(M,M),(0,0,0,0));gb=Image.new('RGBA',(M,M),(0,0,0,0));gd=ImageDraw.Draw(gb,'RGBA')
for j in range(4):
    for i in range(420):
        a=i*.025+j*math.tau/4;rad=(i/420)**.7*107;rad+=R.normal(0,5);xx=C+math.cos(a)*rad;yy=C+math.sin(a)*rad*.65;size=float(R.choice([1,1,2,3,4]));color=[(140,169,249),(243,171,199),(174,204,241),(239,193,155)][j]
        gd.ellipse((xx-size,yy-size,xx+size,yy+size),fill=color+(int(R.integers(110,240)),))
gb=gb.filter(ImageFilter.GaussianBlur(7));spr.alpha_composite(gb)
d=ImageDraw.Draw(spr,'RGBA')
for j in range(4):
    for i in range(180):
        a=i*.06+j*math.tau/4;rad=(i/180)**.7*98+R.normal(0,6);xx=C+math.cos(a)*rad;yy=C+math.sin(a)*rad*.55;rr=float(R.choice([.7,1,1.6,2.5]));d.ellipse((xx-rr,yy-rr,xx+rr,yy+rr),fill=[(189,194,255,190),(246,197,232,180),(177,231,246,180),(239,203,177,165)][j])
d.ellipse((112,114,145,143),fill=(250,235,216,210));spr.save(ROOT/'galaxy.png',optimize=True)
print('Generated',len(list(ROOT.iterdir())),'assets',round(sum(x.stat().st_size for x in ROOT.iterdir())/1024/1024,1),'MB')
