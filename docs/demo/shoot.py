"""
Демо-скриншоты и кадры гифки для README (docs/PROJECT.md, 4.12).
Данные выдуманные (docs/demo/mock.js), обложки — абстрактные (docs/demo/covers).

    npm run build
    python docs/demo/shoot.py docs/media/raw shots   # скриншоты
    python docs/demo/shoot.py docs/media/frames gif  # кадры для гифки
"""
import subprocess, time, sys, os, shutil
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", ".."))
# Короткий тестовый звук вместо настоящих треков.
import wave, struct, math
with wave.open(f"{APP}/dist/tone.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * 220 * i / 22050))) for i in range(22050 * 4)))
MOCK = open(f"{HERE}/mock.js").read()
srv = subprocess.Popen(["npx","vite","preview","--port","4190","--strictPort"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)
URL = "http://localhost:4190"

def route(page):
    page.route("https://demo.covers/**", lambda r: r.fulfill(path=f"{HERE}/covers/" + r.request.url.split("/")[-1].split("?")[0], content_type="image/jpeg"))

def new(b, w, h, scale=1, settings=None):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale)
    pg = ctx.new_page(); route(pg)
    init = MOCK
    if settings: init = f"localStorage.setItem('ym-vinil:settings', JSON.stringify({settings}));" + init
    pg.add_init_script(init)
    return pg

def play_album(pg, name="Ночной трамвай", wait=4200):
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.locator(".sleeve-slot").filter(has_text=name).first.click(); pg.wait_for_timeout(1500)
    pg.locator(".motor-key").click(); pg.wait_for_timeout(wait)

mode = sys.argv[2] if len(sys.argv) > 2 else "shots"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    if mode == "shots":
        # 1. Главный экран
        pg = new(b, 1440, 900, 1.5, '{"hiddenSections":["fresh"]}')
        play_album(pg)
        pg.mouse.move(5, 890)
        pg.evaluate("document.querySelector('.shelf-wrap').scrollTop = 0")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/main.png")
        # 2. Настройки волны
        pg.locator(".lamp-btn", has_text="Настроить волну").click(); pg.wait_for_timeout(200)
        for t in ["Незнакомое", "Спокойное", "Без слов"]:
            pg.locator(".wave-panel .seg button", has_text=t).first.click(); pg.wait_for_timeout(100)
        pg.screenshot(path=f"{OUT}/wave.png")
        pg.context.close()
        # 3. Полный экран с треклистом
        pg = new(b, 1440, 900, 1.5, '{"fsTracklist":true}')
        play_album(pg)
        pg.locator(".lamp-btn", has_text="На весь экран").click(); pg.wait_for_timeout(1200)
        pg.mouse.move(700, 400); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/fullscreen.png")
        pg.context.close()
        # 4. Виды винила
        for style, album in [("black","Ночной трамвай"),("color","Медленный закат"),("clear","Солнечный берег"),("picture","Орбита")]:
            pg = new(b, 1280, 820, 1.5, '{"vinylStyle":"%s"}' % style)
            play_album(pg, album, 2600)
            pg.locator(".turntable").screenshot(path=f"{OUT}/style_{style}.png")
            pg.context.close()
        # 5. Мини-плеер
        pg = new(b, 380, 112, 2)
        pg.goto(URL + "/mini.html"); pg.wait_for_timeout(600)
        pg.evaluate("""window.__demoEmit('player://state', {hasRecord:true,title:'Последний вагон',artist:'Северный ветер',record:'Ночной трамвай',cover:'https://demo.covers/tram.jpg?400x400',labelColor:'#22305e',playing:true,motor:true,liked:true})""")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{OUT}/mini.png")
        pg.context.close()
    else:
        # Кадры для гифки: наведение → пластинка на диск → пуск → игла
        pg = new(b, 1280, 760, 1, '{"hiddenSections":["fresh","recent"]}')
        pg.goto(URL); pg.wait_for_timeout(1500)
        frames = []
        def grab(k=1):
            for _ in range(k):
                path = f"{OUT}/f{len(frames):04d}.png"; pg.screenshot(path=path); frames.append(path)
        sleeve = pg.locator(".sleeve-slot").filter(has_text="Ночной трамвай").first
        sleeve.scroll_into_view_if_needed()
        t0=time.time(); grab(6)
        box = sleeve.bounding_box(); pg.mouse.move(box["x"] + 80, box["y"] + 80, steps=8)
        grab(10)
        sleeve.click(); grab(26)
        pg.locator(".motor-key").click(); grab(55)
        pg.locator(".cue").nth(1).click(); grab(18)
        print(len(frames), "frames", round(time.time()-t0,1), "s")
    b.close()
srv.terminate()
