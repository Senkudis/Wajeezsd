const fs = require('fs');
const path = require('path');

function replaceContent(filePath, startMarkerStr, endMarkerStr, newContent) {
    const file = path.join(__dirname, filePath);
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    const startIdx = content.indexOf(startMarkerStr);
    const endIdx = content.indexOf(endMarkerStr, startIdx);
    
    if (startIdx !== -1 && endIdx !== -1) {
        content = content.substring(0, startIdx) + newContent + content.substring(endIdx);
        fs.writeFileSync(file, content);
    }
}

// ==========================================
// 1. tutorial-merchant-register.html
// ==========================================
const merchantHtml = `<!-- النصوص التسويقية -->
        <div class="text-band">
            <div class="mtext" id="mt1">
                <div class="accent"></div>
                <div class="headline">انضم إلى <span class="hl">تجار وجيز</span></div>
                <div class="subline">سجل متجرك الآن وابدأ في استقبال طلبات عملائك وتوصيلها بكل سهولة</div>
            </div>
            <div class="mtext" id="mt2">
                <div class="accent"></div>
                <div class="headline">أدخل بياناتك <span class="hl">بكل بساطة</span></div>
                <div class="subline">قم بتعبئة نموذج التسجيل في ثوانٍ معدودة لتفعيل متجرك</div>
            </div>
            <div class="mtext" id="mt3">
                <div class="accent"></div>
                <div class="headline">كل شيء جاهز للـ <span class="hl">انطلاق</span></div>
                <div class="subline">سيقوم فريقنا بمراجعة طلبك وستحصل على متجرك الخاص فوراً</div>
            </div>
        </div>

        <!-- الهاتف -->
        <div class="phone-slot" id="phoneSlot">
            <div class="device-container" id="deviceContainer">
                <div class="device-frame" id="deviceFrame">
                    <div class="status-bar" id="statusBar">
                        <span style="color:#111;">9:41</span>
                        <div class="notch"></div>
                        <span style="color:#111;"><i class="bi bi-wifi"></i> <i class="bi bi-battery-full"></i></span>
                    </div>

                    <!-- مشهد 1: الرئيسية -->
                    <div id="scene1" class="screen active" style="background:#f8fafc; padding-top: 60px;">
                        <img src="logo-white.png" style="width: 120px; filter: invert(1); margin: 20px auto; display: block;">
                        <div style="padding: 20px; text-align: center;">
                            <h3 style="font-weight:800; color:#0f172a;">منصة وجيز للتجار</h3>
                            <p style="color:#64748b; font-size:14px;">أدر مبيعاتك، شارك رابطك، ووسع أعمالك</p>
                            <div class="btn-copy-link" id="btnJoinUs" style="margin-top: 30px; border-radius: 50px;">
                                <i class="bi bi-shop fs-5"></i> سجل متجرك الآن
                            </div>
                        </div>
                    </div>

                    <!-- مشهد 2: نموذج التسجيل -->
                    <div id="scene2" class="screen" style="background:#ffffff; padding-top: 60px;">
                        <div style="padding: 10px 20px; border-bottom: 1px solid #e2e8f0; font-weight:800;">
                            <i class="bi bi-arrow-right"></i> تسجيل متجر جديد
                        </div>
                        <div style="padding: 20px;">
                            <div style="margin-bottom: 15px;">
                                <label style="font-size:12px; font-weight:700; color:#64748b;">اسم المتجر</label>
                                <div id="inputName" style="background:#f1f5f9; height: 40px; border-radius: 8px; padding: 10px; display:flex; align-items:center;">
                                    <span class="typing-text" id="type-name"></span><span class="cursor" id="c-name" style="opacity:0; border-left:2px solid #111; margin-right:2px; height:18px;"></span>
                                </div>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <label style="font-size:12px; font-weight:700; color:#64748b;">رقم الهاتف</label>
                                <div id="inputPhone" style="background:#f1f5f9; height: 40px; border-radius: 8px; padding: 10px; display:flex; align-items:center;">
                                    <span class="typing-text" id="type-phone"></span><span class="cursor" id="c-phone" style="opacity:0; border-left:2px solid #111; margin-right:2px; height:18px;"></span>
                                </div>
                            </div>
                            <div style="margin-bottom: 25px;">
                                <label style="font-size:12px; font-weight:700; color:#64748b;">العنوان / المنطقة</label>
                                <div id="inputArea" style="background:#f1f5f9; height: 40px; border-radius: 8px; padding: 10px; display:flex; align-items:center;">
                                    <span class="typing-text" id="type-area"></span><span class="cursor" id="c-area" style="opacity:0; border-left:2px solid #111; margin-right:2px; height:18px;"></span>
                                </div>
                            </div>
                            <div class="btn-copy-link" id="btnSubmit" style="border-radius: 8px; opacity: 0.5;">
                                إرسال الطلب
                            </div>
                        </div>
                    </div>

                    <!-- مشهد 3: النجاح -->
                    <div id="scene3" class="screen" style="background:#04553A; color:white; padding-top: 60px; text-align:center; justify-content:center; align-items:center;">
                        <i class="bi bi-check-circle-fill" style="font-size: 60px; color:#4ade80; margin-bottom: 20px;"></i>
                        <h3 style="font-weight:800;">تم استلام طلبك!</h3>
                        <p style="font-size: 14px; opacity:0.8; padding: 0 20px;">سيقوم فريق وجيز بمراجعة بياناتك والتواصل معك قريباً لتفعيل متجرك.</p>
                    </div>

                </div>
            </div>
        </div>
`;

const merchantJS = `function animatePromo() {
        const tl = gsap.timeline();

        // دخول الهاتف
        tl.call(() => sfx.ambient())
          .set('#phoneSlot', { opacity: 1 })
          .call(() => sfx.whoosh())
          .from('.device-container', { rotateY: 26, rotateX: 9, y: 90, scale: 0.86, duration: 1.6, ease: 'expo.out' })
          .to('.device-container', { rotateY: 0, rotateX: 0, scale: 1, duration: 1.4, ease: 'power3.inOut' }, '-=0.5')
          .set(cursor, { x: 190, y: 690 })

        // مشهد 1: الرئيسية
        tl.add(showText('#mt1'), '-=1.2');
        tl.add(moveCursor('btnJoinUs', 1.1), '+=0.7')
          .add(clickCursor('btnJoinUs'));
        
        // مشهد 2: التسجيل
        tl.add(hideText('#mt1'))
          .add(switchScreen('scene1', 'scene2'), '<');
        tl.add(showText('#mt2'), '-=0.2');
        
        // كتابة الاسم
        tl.add(moveCursor('inputName', 0.6))
          .add(clickCursor('inputName'))
          .set('#c-name', { opacity: 1 })
          .to('#type-name', { text: "بوتيك لمسة", duration: 1.2, ease: "none" })
          .set('#c-name', { opacity: 0 });
          
        // كتابة الهاتف
        tl.add(moveCursor('inputPhone', 0.4))
          .add(clickCursor('inputPhone'))
          .set('#c-phone', { opacity: 1 })
          .to('#type-phone', { text: "0123456789", duration: 1.0, ease: "none" })
          .set('#c-phone', { opacity: 0 });
          
        // كتابة المنطقة
        tl.add(moveCursor('inputArea', 0.4))
          .add(clickCursor('inputArea'))
          .set('#c-area', { opacity: 1 })
          .to('#type-area', { text: "الخرطوم - العمارات", duration: 1.5, ease: "none" })
          .set('#c-area', { opacity: 0 })
          .to('#btnSubmit', { opacity: 1, duration: 0.2 });

        // إرسال الطلب
        tl.add(moveCursor('btnSubmit', 0.6))
          .add(clickCursor('btnSubmit'));
          
        // مشهد 3: النجاح
        tl.add(hideText('#mt2'))
          .add(switchScreen('scene2', 'scene3'), '<')
          .call(() => {
                document.getElementById('statusBar').style.color = '#fff';
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#4ade80', '#ffffff'] });
                sfx.notification();
          });
        tl.add(showText('#mt3'), '-=0.2');
        
        tl.to(cursor, { opacity: 0, duration: 0.4 }, '+=1.0');

        // خروج المشهد
        tl.add(hideText('#mt3'), '+=3.0');
        tl.to('.device-container', { scale: 0.9, opacity: 0, y: 50, duration: 1.0, ease: 'power2.inOut' }, '<');
        
        // إعادة التشغيل
        tl.call(() => {
            gsap.delayedCall(1, () => {
                document.getElementById('type-name').innerText = '';
                document.getElementById('type-phone').innerText = '';
                document.getElementById('type-area').innerText = '';
                document.getElementById('btnSubmit').style.opacity = '0.5';
                document.getElementById('statusBar').style.color = '#111';
                switchScreen('scene3', 'scene1')();
                animatePromo();
            });
        });
    }`;

replaceContent('tutorial-merchant-register.html', '<!-- النصوص التسويقية -->', '<!-- تأثير جسيمات عائمة -->', merchantHtml);
replaceContent('tutorial-merchant-register.html', 'function animatePromo() {', '});\n    }', merchantJS + '\n');


// ==========================================
// 2. tutorial-shop-order.html
// ==========================================
const shopOrderHtml = `<!-- النصوص التسويقية -->
        <div class="text-band">
            <div class="mtext" id="mt1">
                <div class="accent"></div>
                <div class="headline">اطلب من متجرك <span class="hl">المفضل</span></div>
                <div class="subline">تصفح منتجات المتاجر عبر رابطها الخاص، وأضف ما تريده للسلة بسهولة</div>
            </div>
            <div class="mtext" id="mt2">
                <div class="accent"></div>
                <div class="headline">إتمام الطلب في <span class="hl">خطوات بسيطة</span></div>
                <div class="subline">راجع سلتك وأرسل طلبك مباشرة للتاجر في ثوانٍ</div>
            </div>
            <div class="mtext" id="mt3">
                <div class="accent"></div>
                <div class="headline">تأكيد مباشر عبر <span class="hl">واتساب</span></div>
                <div class="subline">يتم إرسال فاتورة طلبك للتاجر في واتساب لتأكيد الدفع والتوصيل مع وجيز</div>
            </div>
        </div>

        <!-- الهاتف -->
        <div class="phone-slot" id="phoneSlot">
            <div class="device-container" id="deviceContainer">
                <div class="device-frame" id="deviceFrame">
                    <div class="status-bar" id="statusBar">
                        <span style="color:#111;">9:41</span>
                        <div class="notch"></div>
                        <span style="color:#111;"><i class="bi bi-wifi"></i> <i class="bi bi-battery-full"></i></span>
                    </div>

                    <!-- مشهد 1: المتجر -->
                    <div id="scene1" class="screen active" style="background:#f8fafc; padding-top: 40px;">
                        <div style="background:white; padding:15px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:10px;">
                            <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=150&q=80" style="width:40px; height:40px; border-radius:50%;">
                            <div>
                                <div style="font-weight:800; font-size:15px;">بوتيك لمسة</div>
                                <div style="font-size:11px; color:#64748b;">مفتوح — الخرطوم</div>
                            </div>
                        </div>
                        <div style="padding:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                                <img src="https://images.unsplash.com/photo-1551537482-f2075a1d41f2?auto=format&fit=crop&w=200&q=80" style="width:100%; height:100px; object-fit:cover;">
                                <div style="padding:10px;">
                                    <div style="font-size:13px; font-weight:700;">جاكيت جينز</div>
                                    <div style="font-size:12px; color:#04553A; font-weight:800; margin-bottom:10px;">25,000 ج.س</div>
                                    <button id="btnAdd" style="width:100%; padding:6px; background:#04553A; color:white; border:none; border-radius:6px; font-size:12px;"><i class="bi bi-plus"></i> أضف للسلة</button>
                                </div>
                            </div>
                            <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                                <img src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=200&q=80" style="width:100%; height:100px; object-fit:cover;">
                                <div style="padding:10px;">
                                    <div style="font-size:13px; font-weight:700;">تيشيرت أبيض</div>
                                    <div style="font-size:12px; color:#04553A; font-weight:800; margin-bottom:10px;">12,000 ج.س</div>
                                    <button style="width:100%; padding:6px; background:#f1f5f9; color:#64748b; border:none; border-radius:6px; font-size:12px;"><i class="bi bi-plus"></i> أضف للسلة</button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- سلة المشتريات العائمة -->
                        <div id="floatingCart" style="position:absolute; bottom:20px; left:20px; right:20px; background:#04553A; color:white; border-radius:15px; padding:15px; display:flex; justify-content:space-between; align-items:center; transform:translateY(100px); opacity:0;">
                            <div><span style="background:white; color:#04553A; padding:2px 6px; border-radius:50%; font-size:12px;">1</span> <span style="font-weight:700;">25,000 ج.س</span></div>
                            <div style="font-weight:800; font-size:14px;">إتمام الطلب <i class="bi bi-arrow-left"></i></div>
                        </div>
                    </div>

                    <!-- مشهد 2: السلة وإتمام الطلب -->
                    <div id="scene2" class="screen" style="background:#f8fafc; padding-top: 40px;">
                        <div style="padding:15px; font-weight:800; font-size:16px;"><i class="bi bi-arrow-right"></i> سلة المشتريات</div>
                        <div style="background:white; padding:15px; margin:0 15px; border-radius:12px;">
                            <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:700;"><span>جاكيت جينز</span><span>25,000 ج.س</span></div>
                            <hr style="margin:10px 0;">
                            <div style="display:flex; justify-content:space-between; font-weight:800; color:#04553A;"><span>الإجمالي</span><span>25,000 ج.س</span></div>
                        </div>
                        <div style="padding:15px;">
                            <label style="font-size:12px; font-weight:700; color:#64748b;">اسم المشتري</label>
                            <div style="background:white; border:1px solid #ddd; height:40px; border-radius:8px; padding:10px; margin-bottom:10px;">أحمد محمد</div>
                            <label style="font-size:12px; font-weight:700; color:#64748b;">موقع التوصيل</label>
                            <div style="background:white; border:1px solid #ddd; height:40px; border-radius:8px; padding:10px; margin-bottom:20px;">الخرطوم، الرياض</div>
                            <button id="btnSendOrder" style="width:100%; padding:15px; background:#25D366; color:white; border:none; border-radius:12px; font-weight:800; font-size:15px;"><i class="bi bi-whatsapp"></i> إرسال الطلب للتاجر</button>
                        </div>
                    </div>

                    <!-- مشهد 3: واتساب -->
                    <div id="scene3" class="screen whatsapp-bg" style="background-color:#e5ddd5;">
                        <div style="background:#075e54; color:white; padding: 45px 15px 10px; display:flex; align-items:center; gap:10px;">
                            <i class="bi bi-arrow-left"></i>
                            <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=150&q=80" style="width:35px; height:35px; border-radius:50%;">
                            <div style="font-weight:700;">بوتيك لمسة</div>
                        </div>
                        <div style="padding:15px; display:flex; flex-direction:column; gap:10px;">
                            <div id="waBubble" style="background:#dcf8c6; padding:10px; border-radius:10px; max-width:85%; align-self:flex-start; transform:scale(0); transform-origin: top right;">
                                <b>طلب جديد من وجيز 🛒</b><br>
                                الاسم: أحمد محمد<br>
                                الطلب: 1x جاكيت جينز<br>
                                الإجمالي: 25,000 ج.س<br>
                                التوصيل: الخرطوم، الرياض<br>
                                <span style="font-size:10px; color:#666; display:block; text-align:left; margin-top:5px;">9:42 ✓✓</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
`;

const shopOrderJS = `function animatePromo() {
        const tl = gsap.timeline();

        // دخول الهاتف
        tl.call(() => sfx.ambient())
          .set('#phoneSlot', { opacity: 1 })
          .call(() => sfx.whoosh())
          .from('.device-container', { rotateY: 26, rotateX: 9, y: 90, scale: 0.86, duration: 1.6, ease: 'expo.out' })
          .to('.device-container', { rotateY: 0, rotateX: 0, scale: 1, duration: 1.4, ease: 'power3.inOut' }, '-=0.5')
          .set(cursor, { x: 190, y: 690 })

        // مشهد 1: المتجر
        tl.add(showText('#mt1'), '-=1.2');
        tl.add(moveCursor('btnAdd', 1.0), '+=0.5')
          .add(clickCursor('btnAdd'))
          .to('#floatingCart', { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' })
          .call(() => sfx.notification());
          
        tl.add(moveCursor('floatingCart', 0.8))
          .add(clickCursor('floatingCart'));

        // مشهد 2: السلة
        tl.add(hideText('#mt1'))
          .add(switchScreen('scene1', 'scene2'), '<');
        tl.add(showText('#mt2'), '-=0.2');
        
        tl.add(moveCursor('btnSendOrder', 1.2), '+=1.0')
          .add(clickCursor('btnSendOrder'));

        // مشهد 3: واتساب
        tl.add(hideText('#mt2'))
          .add(switchScreen('scene2', 'scene3'), '<')
          .call(() => document.getElementById('statusBar').style.color = '#fff');
        tl.add(showText('#mt3'), '-=0.2');
        
        tl.to('#waBubble', { scale: 1, duration: 0.4, ease: 'back.out(1.5)' }, '+=0.3')
          .call(() => sfx.notification());

        tl.to(cursor, { opacity: 0, duration: 0.4 }, '+=1.0');

        // خروج المشهد
        tl.add(hideText('#mt3'), '+=3.5');
        tl.to('.device-container', { scale: 0.9, opacity: 0, y: 50, duration: 1.0, ease: 'power2.inOut' }, '<');
        
        // إعادة التشغيل
        tl.call(() => {
            gsap.delayedCall(1, () => {
                document.getElementById('floatingCart').style.transform = 'translateY(100px)';
                document.getElementById('floatingCart').style.opacity = '0';
                document.getElementById('waBubble').style.transform = 'scale(0)';
                document.getElementById('statusBar').style.color = '#111';
                switchScreen('scene3', 'scene1')();
                animatePromo();
            });
        });
    }`;

replaceContent('tutorial-shop-order.html', '<!-- النصوص التسويقية -->', '<!-- تأثير جسيمات عائمة -->', shopOrderHtml);
replaceContent('tutorial-shop-order.html', 'function animatePromo() {', '});\n    }', shopOrderJS + '\n');


// ==========================================
// 3. tutorial-app-order.html
// ==========================================
const appOrderHtml = `<!-- النصوص التسويقية -->
        <div class="text-band">
            <div class="mtext" id="mt1">
                <div class="accent"></div>
                <div class="headline">اطلب <span class="hl">أي شيء</span> من تطبيق وجيز</div>
                <div class="subline">حدد مكان استلام الطلب ومكان التوصيل على الخريطة لتوجيه المندوب</div>
            </div>
            <div class="mtext" id="mt2">
                <div class="accent"></div>
                <div class="headline">اكتب تفاصيل <span class="hl">طلبك</span></div>
                <div class="subline">ماذا تريد؟ (مثال: جيب لي غداء من المطعم الفلاني)</div>
            </div>
            <div class="mtext" id="mt3">
                <div class="accent"></div>
                <div class="headline">تتبع <span class="hl">مباشر</span> للمندوب</div>
                <div class="subline">شاهد كابتن وجيز وهو يتجه إليك وتواصل معه بسهولة داخل التطبيق</div>
            </div>
        </div>

        <!-- الهاتف -->
        <div class="phone-slot" id="phoneSlot">
            <div class="device-container" id="deviceContainer">
                <div class="device-frame" id="deviceFrame">
                    <div class="status-bar" id="statusBar">
                        <span style="color:#111;">9:41</span>
                        <div class="notch"></div>
                        <span style="color:#111;"><i class="bi bi-wifi"></i> <i class="bi bi-battery-full"></i></span>
                    </div>

                    <!-- مشهد 1: الخريطة واختيار الموقع -->
                    <div id="scene1" class="screen active" style="background:#f8fafc; padding-top: 40px; position:relative;">
                        <div style="height:50%; background:#e2e8f0; position:relative; overflow:hidden;">
                            <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=80" style="width:100%; height:100%; object-fit:cover; opacity:0.6;">
                            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-100%); text-align:center;">
                                <div style="background:#0f172a; color:white; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:700; margin-bottom:5px;">موقع الاستلام</div>
                                <i class="bi bi-geo-alt-fill text-danger fs-2"></i>
                            </div>
                        </div>
                        <div style="padding:20px; background:white; border-radius:20px 20px 0 0; position:absolute; bottom:0; width:100%; height:55%; box-shadow:0 -5px 20px rgba(0,0,0,0.05);">
                            <h4 style="font-weight:800; margin-bottom:20px;">أين نذهب؟</h4>
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px; background:#f1f5f9; padding:10px; border-radius:10px;">
                                <i class="bi bi-circle text-primary"></i> <span style="font-weight:700; font-size:14px;">مطعم البيك (الاستلام)</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px; background:#f1f5f9; padding:10px; border-radius:10px;">
                                <i class="bi bi-geo-alt text-danger"></i> <span style="font-weight:700; font-size:14px;">المنزل (التوصيل)</span>
                            </div>
                            <button id="btnNext" style="width:100%; padding:15px; background:#04553A; color:white; border:none; border-radius:12px; font-weight:800; font-size:15px;">التالي</button>
                        </div>
                    </div>

                    <!-- مشهد 2: تفاصيل الطلب -->
                    <div id="scene2" class="screen" style="background:#f8fafc; padding-top: 40px;">
                        <div style="padding:15px; font-weight:800; font-size:16px; background:white; border-bottom:1px solid #eee;"><i class="bi bi-arrow-right"></i> تفاصيل الطلب</div>
                        <div style="padding:20px;">
                            <label style="font-weight:700; font-size:14px; margin-bottom:10px; display:block;">ماذا تريد أن نُحضر لك؟</label>
                            <div style="background:white; border:1px solid #ddd; height:120px; border-radius:12px; padding:15px; font-size:14px; position:relative;">
                                <span id="type-order"></span><span id="c-order" style="opacity:0; border-left:2px solid #111;"></span>
                            </div>
                            <button id="btnConfirm" style="width:100%; padding:15px; background:#04553A; color:white; border:none; border-radius:12px; font-weight:800; font-size:15px; margin-top:20px;">تأكيد الطلب</button>
                        </div>
                    </div>

                    <!-- مشهد 3: التتبع -->
                    <div id="scene3" class="screen" style="background:#f8fafc; padding-top: 40px; position:relative;">
                        <div style="height:70%; background:#e2e8f0; position:relative; overflow:hidden;">
                            <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=800&q=80" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
                            
                            <div id="mapDriver" style="position:absolute; top:20%; left:20%; font-size:24px; color:#04553A; background:white; border-radius:50%; width:35px; height:35px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.2);"><i class="bi bi-bicycle"></i></div>
                            <div style="position:absolute; top:70%; left:70%; font-size:24px; color:#e11d48;"><i class="bi bi-geo-alt-fill"></i></div>
                        </div>
                        <div style="padding:20px; background:white; border-radius:20px 20px 0 0; position:absolute; bottom:0; width:100%; height:35%; box-shadow:0 -5px 20px rgba(0,0,0,0.05);">
                            <div style="text-align:center; font-weight:800; color:#04553A; margin-bottom:15px;">جاري التوصيل — يصل خلال 10 دقائق</div>
                            <div style="display:flex; align-items:center; gap:15px;">
                                <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=150&q=80" style="width:50px; height:50px; border-radius:50%;">
                                <div>
                                    <div style="font-weight:800;">محمد علي</div>
                                    <div style="font-size:12px; color:#64748b;">كابتن وجيز ⭐️ 4.9</div>
                                </div>
                                <div style="margin-right:auto; display:flex; gap:10px;">
                                    <div style="width:40px; height:40px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:#04553A;"><i class="bi bi-chat-fill"></i></div>
                                    <div style="width:40px; height:40px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:#04553A;"><i class="bi bi-telephone-fill"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
`;

const appOrderJS = `function animatePromo() {
        const tl = gsap.timeline();

        // دخول الهاتف
        tl.call(() => sfx.ambient())
          .set('#phoneSlot', { opacity: 1 })
          .call(() => sfx.whoosh())
          .from('.device-container', { rotateY: 26, rotateX: 9, y: 90, scale: 0.86, duration: 1.6, ease: 'expo.out' })
          .to('.device-container', { rotateY: 0, rotateX: 0, scale: 1, duration: 1.4, ease: 'power3.inOut' }, '-=0.5')
          .set(cursor, { x: 190, y: 690 })

        // مشهد 1: الرئيسية
        tl.add(showText('#mt1'), '-=1.2');
        tl.add(moveCursor('btnNext', 1.0), '+=1.0')
          .add(clickCursor('btnNext'));

        // مشهد 2: تفاصيل الطلب
        tl.add(hideText('#mt1'))
          .add(switchScreen('scene1', 'scene2'), '<');
        tl.add(showText('#mt2'), '-=0.2');
        
        tl.add(moveCursor('btnConfirm', 0.8))
          .set('#c-order', { opacity: 1 })
          .to('#type-order', { text: "جيب لي وجبة دجاج بروستد مع بطاطس ومشروب غازي، وحاسبهم وبحاسبك عند الاستلام.", duration: 3.0, ease: "none" })
          .set('#c-order', { opacity: 0 });

        tl.add(clickCursor('btnConfirm'));

        // مشهد 3: التتبع
        tl.add(hideText('#mt2'))
          .add(switchScreen('scene2', 'scene3'), '<');
        tl.add(showText('#mt3'), '-=0.2');
        
        tl.to('#mapDriver', { left: '70%', top: '65%', duration: 4.5, ease: 'power1.inOut' }, '+=0.2');

        tl.to(cursor, { opacity: 0, duration: 0.4 }, '+=0.5');

        // خروج المشهد
        tl.add(hideText('#mt3'), '+=1.0');
        tl.to('.device-container', { scale: 0.9, opacity: 0, y: 50, duration: 1.0, ease: 'power2.inOut' }, '<');
        
        // إعادة التشغيل
        tl.call(() => {
            gsap.delayedCall(1, () => {
                document.getElementById('type-order').innerText = '';
                document.getElementById('mapDriver').style.left = '20%';
                document.getElementById('mapDriver').style.top = '20%';
                switchScreen('scene3', 'scene1')();
                animatePromo();
            });
        });
    }`;

replaceContent('tutorial-app-order.html', '<!-- النصوص التسويقية -->', '<!-- تأثير جسيمات عائمة -->', appOrderHtml);
replaceContent('tutorial-app-order.html', 'function animatePromo() {', '});\n    }', appOrderJS + '\n');
