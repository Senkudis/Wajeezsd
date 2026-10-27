import sys, numpy as np
from faster_whisper import WhisperModel
m=WhisperModel('models/large-v3', device='cpu', compute_type='int8')
P='حوار باللهجة السودانية عن تطبيق وجيز للتوصيل: يا إبراهيم، أنا جاي من السعودية، تطبيقات التوصيل، داير لي حاجة، السوق، الزحمة، البنزين الغالي، الصفوف، عندك حل؟ تطبيق وجيز، التوصيل السريع والمضمون، الميزة بتاعتو، تتابع الطلب، الكابتن، تحدد السعر، الواجهة بسيطة وسهلة، حمّل تطبيق وجيز.'
for src in sys.argv[1:]:
  a=np.fromfile(src,dtype=np.float32)
  for temp in (0.0,):
    segs,_=m.transcribe(a, language='ar', word_timestamps=False, beam_size=8, best_of=5, temperature=temp, initial_prompt=P, condition_on_previous_text=False)
    print('==',src); [print(f'[{s.start:5.2f}-{s.end:5.2f}] {s.text}') for s in segs]
