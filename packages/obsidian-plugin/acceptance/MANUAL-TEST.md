# Ручная приёмка плагина Transitrix Studio для Obsidian {{PLUGIN_VERSION}}

Проверяется именно пакет из опубликованного релиза, то есть то, что скачивает пользователь:
{{RELEASE_URL}}

- Тестовый vault: `{{VAULT}}` (плагин из релиза уже лежит в `.obsidian/plugins/transitrix-studio/`).
- Отчёт заполняется в `REPORT.md` рядом с этим файлом.
- Скриншоты кладите в папку `screenshots/` под именами из таблиц (например `T01.png`).
- Всё проверяется в **Reading view** (Live Preview плагин пока не поддерживает).

Ожидаемые результаты ниже проверены автоматически на реальных рендерерах плагина
(`packages/obsidian-plugin/test/acceptance-fixtures.test.ts`), поэтому расхождение с
ожиданием в Obsidian — это находка, а не ошибка в плане.

## 0. Подготовка

1. Установите Obsidian Desktop (запишите версию: Settings → About → Current version).
2. Obsidian → «Open folder as vault» → выберите `{{VAULT}}`.
3. Если Obsidian спросит про сторонние плагины, выберите «Turn on community plugins»
   (Settings → Community plugins → Restricted mode = off).
4. В Settings → Community plugins → Installed plugins убедитесь, что **Transitrix Studio**
   включён и версия {{PLUGIN_VERSION}}. Скриншот: `00-plugin-version.png`.
5. Откройте консоль разработчика (Ctrl+Shift+I → Console) и оставьте её открытой.
   Любые красные сообщения, связанные с `transitrix`, скопируйте в раздел «Консоль» отчёта.

Не меняйте ничего в vault, кроме заметки `scratch/S01-edit-me.md` и настроек плагина.

## 1. Все семь типов диаграмм (Reading view)

Откройте заметку, переключите в Reading view (Ctrl+E), сделайте скриншот, сравните с ожиданием.

| ID | Заметка | Что должно быть |
| --- | --- | --- |
| T01 | `valid/T01-goals` | дерево Goals: корень и два дочерних узла |
| T02 | `valid/T02-dgca` | цепочка из четырёх уровней: фактор, цель, изменение, действие |
| T03 | `valid/T03-dga` | цепочка из трёх уровней, без уровня изменений |
| T04 | `valid/T04-action` | сеть из четырёх работ: две идут параллельно после первой и обе ведут к последней |
| T05 | `valid/T05-action-card` | карточка с описанием и двумя вехами (2026-06-01, 2026-07-15) |
| T06a, T06b | `valid/T06-blocks` | две диаграммы: вложенные блоки (Application с UI и API) и сетка RACI (PM = A, Eng = R) |
| T07 | `valid/T07-process-blueprint` | blueprint из двух этапов: Receive и Ship |
| T08 | `valid/T08-mixed` | первая и третья диаграммы нарисованы, вторая показывает панель ошибки и не ломает соседние |

Для каждой диаграммы также отметьте: текст читается, ничего не обрезано, нет пустого места/наложений.

## 2. Обновление диаграмм

### 2.1 После редактирования (заметка `scratch/S01-edit-me`)

1. Откройте заметку в Reading view: два узла («Original root», «Original child»). Скриншот `R1-before.png`.
2. Ctrl+E (режим редактирования). Замените `Original child` на `Edited child` и добавьте строку
   `  - { id: GOAL-EDIT-3, name: Added goal, type: Objective, level: 1, parent: GOAL-EDIT-1 }`
   в конец списка `goals`.
3. Ctrl+E (обратно в Reading view). Ожидание: три узла, имена обновились. Скриншот `R1-after.png`.
4. Снова в редактирование: испортите YAML (например, удалите двоеточие после `goals`). Reading view:
   панель ошибки «Could not render diagram». Скриншот `R1-broken.png`.
5. Исправьте YAML. Reading view: диаграмма вернулась.

### 2.2 После смены настроек

Откройте `valid/T01-goals` в Reading view и держите заметку открытой. Settings → Transitrix Studio.
Диаграммы в открытых заметках должны обновляться сразу после смены настройки (без перезапуска).
Какие диаграммы реагируют на какую настройку:

| Настройка | Значения | Меняется в |
| --- | --- | --- |
| Theme | Transitrix light / Transitrix dark / Follow Obsidian | все 7 типов (T01–T07) |
| Node size | Compact / Normal / Wide | Goals, DGCA, DGA, Action, Process Blueprint и вложенные Blocks (T06a). Не меняется: Action Card и сетка Blocks (T06b) |
| Edge style | Straight / Bezier / Polyline | только Goals, DGCA, DGA |
| Edge curvature | ползунок 0–3 | Goals, DGCA, DGA, Action |
| Reset | кнопка Reset display | возвращает theme = Transitrix light, node size = Normal, edge style и curvature по умолчанию |

Для каждой строки отметьте PASS/FAIL по T01 и по заметкам из последнего столбца
(достаточно по одной на тип: T02, T04, T05, T06, T07). Для «Follow Obsidian» дополнительно
переключите тему самого Obsidian (Settings → Appearance) и убедитесь, что диаграмма следует за ней.
Скриншоты: `R2-theme-dark.png`, `R2-node-wide.png`, `R2-edge-polyline.png`, `R2-curvature-3.png`,
`R2-action-card-theme.png`.

### 2.3 После перезапуска

1. Выставьте: Theme = Transitrix dark, Node size = Wide, Edge style = Polyline, Curvature = 2.
2. **Полностью закройте Obsidian** (не только окно; в Windows проверьте трей) и откройте vault снова.
3. Откройте Settings → Transitrix Studio: значения сохранились. Откройте `valid/T01-goals`:
   диаграмма нарисована с этими настройками. Скриншоты `R3-settings.png`, `R3-diagram.png`.
4. Верните настройки кнопкой Reset display.

### 2.4 Отключение и включение плагина

1. Settings → Community plugins → выключите **Transitrix Studio**. Откройте `valid/T01-goals` в Reading view:
   диаграммы нет, fence показан как обычный блок кода. Скриншот `R4-off.png`.
2. Включите плагин обратно. Перезапуск не нужен: переоткройте заметку или переключите режимы,
   диаграмма должна вернуться. Скриншот `R4-on.png`.
3. Проверьте, что в консоли нет новых красных ошибок.

## 3. Некорректный и неподдерживаемый контент

Откройте каждую заметку в Reading view. Во всех случаях Obsidian не должен зависать или падать,
остальной текст заметки должен быть виден.

| ID | Заметка | Что должно быть |
| --- | --- | --- |
| E01 | `errors/E01-invalid-yaml` | панель ошибки «Could not render diagram» (синтаксис YAML); строка под блоком видна |
| E02 | `errors/E02-invalid-document` | панель ошибки с сообщениями валидации (id не соответствует формату) |
| E03a, E03b | `errors/E03-projection` | у обоих fence панель ошибки: репозиторные представления не поддерживаются, нужен самодостаточный документ |
| E04 | `errors/E04-empty` | панель ошибки: блок пуст |
| E05 | `errors/E05-oversize` | панель ошибки: размер источника должен быть не больше 32768 байт |
| E06 | `errors/E06-wrong-notation` | панель ошибки (DGCA-документ в Goals-fence), без диаграммы |
| E07 | `errors/E07-unknown-language` | плагин не трогает fence: обычный блок кода, без диаграммы и без панели ошибки |

Скриншоты: `E01.png` … `E07.png`. Для каждой панели ошибки перепишите в отчёт её заголовок и первую строку.

## 4. Сохранность исходных заметок

После всех проверок **закройте Obsidian** и выполните в репозитории transitrix-studio:

```sh
npm run acceptance:obsidian -- check --out "<папка набора>"
```

Команда сравнивает хеши всех заметок (кроме `scratch/`) с хешами до проверки, хеши трёх файлов плагина
с хешами релиза, и выводит сохранённые настройки плагина (`data.json`). Результат записывается в
`AUTO-CHECKS.md`. Ожидание: все заметки без изменений, файлы плагина совпадают с релизом.

## 5. Отправка результатов

Отправьте письмо на **automation@transitrix.com**

- Тема: `Obsidian plugin {{PLUGIN_VERSION}}: manual acceptance report`
- Вложения: заполненный `REPORT.md`, `AUTO-CHECKS.md`, папка `screenshots/` (архив:
  `Compress-Archive screenshots screenshots.zip` в PowerShell).
- В тексте письма: вердикт (PASS/FAIL), список упавших пунктов, версия Obsidian и ОС.
