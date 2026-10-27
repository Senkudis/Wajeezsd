import sys, numpy as np
from faster_whisper import WhisperModel
m=WhisperModel('models/large-v3', device='cpu', compute_type='int8')
a=np.fromfile('src/v16.f32',dtype=np.float32); b=np.fromfile('src/a16.f32',dtype=np.float32)
for (s,e) in [(11.4,16.3),(22.4,28.3),(34.4,38.2),(6.2,11.6)]:
  for name,x in (('clean',a),('raw',b)):
    for t in (0.0,0.4):
      segs,_=m.transcribe(x[int(s*16000):int(e*16000)], language='ar', beam_size=8, temperature=t, condition_on_previous_text=False, initial_prompt='كلام سوداني عامي.')
      print(f'{s}-{e} {name} T{t}:', ' '.join(z.text for z in segs))
