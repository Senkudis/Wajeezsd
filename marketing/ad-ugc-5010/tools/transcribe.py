import json, sys
from faster_whisper import WhisperModel
m=WhisperModel(sys.argv[2] if len(sys.argv)>2 else 'models/large-v3', device='cpu', compute_type='int8')
import numpy as np
audio=np.fromfile(sys.argv[1],dtype=np.float32) if sys.argv[1].endswith('.f32') else sys.argv[1]
segs,info=m.transcribe(audio, language='ar', word_timestamps=True, vad_filter=False, beam_size=5,
  initial_prompt='إعلان تطبيق وجيز للتوصيل في السودان، باللهجة السودانية.')
out=[]
for s in segs:
    print(f'[{s.start:6.2f}-{s.end:6.2f}] {s.text}')
    out.append({'start':s.start,'end':s.end,'text':s.text,'words':[{'w':w.word,'s':w.start,'e':w.end,'p':w.probability} for w in s.words]})
json.dump(out,open('src/transcript.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
