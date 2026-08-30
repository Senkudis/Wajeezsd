/**
 * 📊 أداة تصدير البيانات إلى Excel و CSV للوحة الإدارة (Wajeez Admin Export)
 * 
 * - تدعم اللغة العربية بنسبة 100% باستخدام UTF-8 BOM (\uFEFF) لمنع تشوه الحروف في Excel.
 * - متوافقة تماماً مع بيئة Android WebView و Capacitor وتطبيقات الويب (تفتح لوحة المشاركة الأصلية في الأندرويد).
 * - تتيح تصدير المصفوفات المباشرة أو استخراج البيانات من الجداول (HTML Tables).
 */

(function () {
    'use strict';

    function escapeCSVCell(val) {
        if (val === null || val === undefined) return '""';
        let str = String(val).trim();
        // إزالة الفراغات الزائدة والأسطر المتعددة غير المرغوبة
        str = str.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');
        if (str.includes('"') || str.includes(',') || str.includes(';')) {
            str = str.replace(/"/g, '""');
        }
        return `"${str}"`;
    }

    const AdminExport = {
        /**
         * تصدير مصفوفة بيانات إلى ملف CSV / Excel
         * @param {string} filename اسم الملف بدون امتداد أو معه
         * @param {string[]} headers عناوين الأعمدة
         * @param {Array<Array<any>>} rows صفوف البيانات
         */
        toCSV: async function (filename = 'export', headers = [], rows = []) {
            if (!rows || rows.length === 0) {
                if (window.Swal) {
                    Swal.fire({
                        icon: 'info',
                        title: 'لا توجد بيانات',
                        text: 'لا توجد بيانات متاحة للتصدير حالياً',
                        confirmButtonText: 'حسناً',
                        confirmButtonColor: '#048c5b'
                    });
                } else {
                    alert('لا توجد بيانات متاحة للتصدير حالياً');
                }
                return;
            }

            const headerLine = headers.map(escapeCSVCell).join(',');
            const rowLines = rows.map(r => r.map(escapeCSVCell).join(','));
            const csvContent = [headerLine, ...rowLines].join('\r\n');
            const safeName = (filename.endsWith('.csv') ? filename : `${filename}.csv`).replace(/[^\w\d_\-\.\u0600-\u06FF]/g, '_');

            // 1. 📱 دعم الأندرويد المباشر عبر Web Share API للملفات (مشاركة مباشرة وحفظ في الجهاز)
            try {
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                if (typeof File !== 'undefined' && navigator.canShare) {
                    const file = new File([blob], safeName, { type: 'text/csv;charset=utf-8' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'تصدير تقرير وجيز',
                            text: `ملف تقرير: ${safeName}`
                        });
                        if (window.AdminAlerts) window.AdminAlerts.play('success');
                        return;
                    }
                }
            } catch (shareErr) {
                if (shareErr && shareErr.name === 'AbortError') return; // قام المستخدم بإغلاق لوحة المشاركة
                console.warn('Native Web Share fallback:', shareErr);
            }

            // 2. 📱 دعم Capacitor Native Plugins (Filesystem + Share)
            try {
                if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
                    const base64Data = btoa(unescape(encodeURIComponent('\uFEFF' + csvContent)));
                    if (window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
                        const fs = window.Capacitor.Plugins.Filesystem;
                        const res = await fs.writeFile({
                            path: safeName,
                            data: base64Data,
                            directory: 'CACHE',
                            recursive: true
                        });
                        if (window.Capacitor.Plugins.Share) {
                            await window.Capacitor.Plugins.Share.share({
                                title: 'تصدير تقرير وجيز',
                                url: res.uri
                            });
                            if (window.AdminAlerts) window.AdminAlerts.play('success');
                            return;
                        }
                    }
                }
            } catch (capErr) {
                console.warn('Capacitor Filesystem fallback:', capErr);
            }

            // 3. 💻 التنزيل عبر المتصفح القياسي (Desktop & Mobile Browser fallback)
            try {
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', safeName);
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    if (document.body.contains(link)) document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 1000);

                if (window.AdminAlerts) window.AdminAlerts.play('success');
                if (window.Swal) {
                    Swal.fire({
                        icon: 'success',
                        title: 'تم التصدير بنجاح',
                        text: `تم تجهيز وتنزيل الملف: ${safeName}`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
            } catch (err) {
                console.error('Export download error:', err);
                // 4. Data URI Fallback
                const encodedUri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvContent);
                window.open(encodedUri, '_blank');
            }
        },

        /**
         * تصدير محتوى جدول HTML مباشر
         * @param {string|HTMLTableElement} tableEl مُعرّف الجدول أو العنصر
         * @param {string} filename اسم الملف
         */
        tableToCSV: function (tableEl, filename = 'table_export') {
            const table = typeof tableEl === 'string' ? document.querySelector(tableEl) : tableEl;
            if (!table) {
                if (window.Swal) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'الجدول غير متاح',
                        text: 'لم يتم العثور على بيانات الجدول حالياً',
                        confirmButtonText: 'حسناً',
                        confirmButtonColor: '#048c5b'
                    });
                }
                return;
            }

            const headers = [];
            const headerCells = table.querySelectorAll('thead th');
            headerCells.forEach(th => {
                const text = th.innerText.trim();
                if (text && text !== 'الإجراءات' && text !== 'خيارات' && text !== 'إجراء' && text !== '') {
                    headers.push(text);
                }
            });

            const rows = [];
            const rowElements = table.querySelectorAll('tbody tr');
            rowElements.forEach(tr => {
                // تجاهل صفوف الفراغ والتحميل
                if (tr.classList.contains('empty-row') || 
                    tr.querySelector('.spinner-border') || 
                    tr.querySelector('.fa-spinner') || 
                    tr.innerText.includes('لا توجد') || 
                    tr.innerText.includes('جاري التحميل') ||
                    tr.innerText.includes('جاري')) return;

                const rowData = [];
                const cells = tr.querySelectorAll('td');
                if (cells.length > 0) {
                    cells.forEach((td, idx) => {
                        // تخطي خلايا أزرار الإجراءات في النهاية
                        if (idx < headers.length) {
                            rowData.push(td.innerText.trim());
                        }
                    });
                    if (rowData.length > 0 && rowData.some(c => c !== '')) {
                        rows.push(rowData);
                    }
                }
            });

            this.toCSV(filename, headers, rows);
        }
    };

    window.AdminExport = AdminExport;
})();
