import av, numpy as np, sys, wave
c=av.open(sys.argv[1]); a=c.streams.audio[0]
r=av.AudioResampler(format='s16',layout='stereo',rate=48000)
buf=[]
for f in c.decode(a):
    for g in r.resample(f): buf.append(g.to_ndarray())
for g in r.resample(None): buf.append(g.to_ndarray())
x=np.concatenate(buf,axis=1).reshape(-1,2) if buf[0].shape[0]==1 else np.concatenate(buf,axis=1).T
w=wave.open(sys.argv[2],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000); w.writeframes(x.astype('<i2').tobytes()); w.close()
m=x.astype(float).mean(1)/32768
print('dur',len(m)/48000,'peak',abs(m).max(),'rms dB',20*np.log10(np.sqrt((m**2).mean())))
for i in range(0,len(m),24000): s=m[i:i+24000]; print(f'{i/48000:5.1f} {20*np.log10(np.sqrt((s**2).mean())+1e-9):6.1f}', end=' |')
