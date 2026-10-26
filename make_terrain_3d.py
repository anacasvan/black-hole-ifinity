"""Generate an original seamlessly-tileable photographic-style grass and soil albedo map."""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
rng=np.random.default_rng(13)
w=1024
noise=lambda sigma: gaussian_filter(rng.standard_normal((w,w)).astype('float32'),sigma,mode='wrap')
# Normalize each octave to preserve contrast at both ground and camera heights.
def unit(arr):return (arr-arr.mean())/(arr.std()+1e-8)
m=unit(noise(115))*.40+unit(noise(42))*.20+unit(noise(17))*.12+unit(noise(5))*.052+unit(noise(1))*.030
# Darker dense grass, pale dry grass, mineral soil patches.
green=np.stack([75+m*22,100+m*22,64+m*18],axis=-1)
dry=np.stack([126+m*13,117+m*12,75+m*11],axis=-1)
blend=np.clip((m-.03)*1.6,0,.38)[...,None]
a=green*(1-blend)+dry*blend
# Fine random blades and mineral granularity.
fine=rng.normal(0,4.4,(w,w,1)).astype('float32');a+=fine
# Very small dark vegetation tufts.
for _ in range(6500):
 x=int(rng.integers(0,w));y=int(rng.integers(0,w));radius=int(rng.integers(1,4));val=int(rng.integers(8,21));a[max(0,y-radius):min(w,y+radius),max(0,x-radius):min(w,x+radius)]-=np.array([val,val*.7,val*.35])
a=np.clip(a,0,255).astype('uint8');out=Path('/mnt/data/black-hole-infinity/assets/terrain3d.jpg');Image.fromarray(a,'RGB').save(out,quality=87,optimize=True)
print(out,out.stat().st_size)
