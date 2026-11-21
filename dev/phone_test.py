import asyncio, json, urllib.request, urllib.parse
from playwright.async_api import async_playwright
K=open('mock4.log').read().split('KEY ')[1].split()[0]
def post(o): return json.loads(urllib.request.urlopen(urllib.request.Request('http://localhost:8767/',data=json.dumps(dict(o,key=K)).encode(),method='POST')).read().decode())
def rows(name):
    c=[s for s in json.loads(urllib.request.urlopen('http://localhost:8767/ctl?dump=1').read()) if s['name']==name][0]['cells']
    return [{h:str(v) for h,v in zip(c[0],r) if h and v!=''} for r in c[1:]]
post({'action':'push','ops':[
 {'sheet':'Hotels','rid':'h1','isNew':True,'v':{'Hotel name':'Hotel Gracery Shinjuku','City':'Tokyo','Check-in':'2027-04-08','Check-out':'2027-04-12','Map link':'https://maps.app.goo.gl/gracery'}},
 {'sheet':'Hotels','rid':'h2','isNew':True,'v':{'Hotel name':'Kyoto Granbell','City':'Kyoto'}},
 {'sheet':'Places','rid':'pl1','isNew':True,'v':{'Place name':'Senso-ji','City':'Tokyo','Map link':'https://maps.app.goo.gl/senso'}},
 {'sheet':'Places','rid':'pl2','isNew':True,'v':{'Place name':'Meiji Shrine','City':'Tokyo','Planned day':'2027-04-09'}},
 {'sheet':'Food','rid':'f1','isNew':True,'v':{'Name':'Ichiran','City':'Tokyo'}},
 {'sheet':'Attractions','rid':'a1','isNew':True,'v':{'What':'teamLab Planets','Visit date':'2027-04-09','Time':'09:30','Status':'To book','Where to book (link)':'https://teamlab.art/e/planets/'}},
 {'sheet':'Attractions','rid':'a2','isNew':True,'v':{'What':'Ghibli Museum','Visit date':'2027-04-09','Time':'14:00','Status':'Booked'}},
 {'sheet':'Flights','rid':'fl1','isNew':True,'v':{'Departure date':'2027-04-08','Departs (local)':'06:10','From (airport)':'CDG','To (airport)':'HND','Flight no.':'AF274'}},
 {'sheet':'Days','rid':'d1','v':{'Starts in':'Tokyo','Ends in':'Tokyo'}}]})
async def chips(pg): return await pg.eval_on_selector_all('.chip.sm','e=>e.map(x=>x.innerText.replace(/\\n/g,": "))')
async def blocks(pg): return await pg.eval_on_selector_all('.dblock','e=>e.map(x=>x.innerText.replace(/\\n/g," | "))')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']); errs=[]
        ctx=await b.new_context(viewport={'width':360,'height':740},is_mobile=True,has_touch=True,permissions=['clipboard-read','clipboard-write'])
        pg=await ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.add_init_script("window.__opened=[];window.open=function(u){window.__opened.push(u);return null;}")
        B='http://localhost:8771/japan-planner/preview/'
        await pg.goto(B); await pg.click('text=Connect to our trip sheet'); await pg.fill('#pass',K); await pg.click('.sheetbox button.primary'); await pg.wait_for_selector('.blocks')
        print('tabs:',await pg.eval_on_selector_all('#tabs .tab','e=>e.map(x=>x.innerText)'))
        print('D1 blocks:',await blocks(pg)); print('D1 chips:',await chips(pg))
        await pg.screenshot(path='v28_day1.png')
        await pg.click('[aria-label="Next day"]'); print('D2 blocks:',await blocks(pg)); print('D2 chips:',await chips(pg))
        # pick Senso-ji into Morning with 15:00
        await pg.click('.dblock >> nth=0'); await pg.wait_for_timeout(200)
        if await pg.is_visible('text=Add to Morning'): await pg.click('text=Add to Morning')
        await pg.select_option('#pick',label='Senso-ji · Tokyo'); 
        print('own fields hidden:',await pg.is_hidden('input[data-h="Name"]'),'| from line:',await pg.inner_text('.sheetbox p.note >> nth=1'))
        await pg.fill('input[data-h="Time"]','15:00'); await pg.fill('textarea[data-h="Notes"]','Go before sunset'); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(300)
        print('toast:',await pg.inner_text('#toast')); await pg.click('.sheetbox >> text=Close') if await pg.is_visible('.sheetbox') else None
        print('D2 blocks after:',await blocks(pg))
        await pg.wait_for_timeout(2500)
        print('sheet Places:',[ (r['Place name'],r.get('Planned day'),r.get('Planned time')) for r in rows('Places')])
        print('sheet Itinerary:',[(r.get('Date'),r.get('Time'),r.get('Part'),r.get('Name'),r.get('Type'),r.get('Notes'),r.get('_id')) for r in rows('Itinerary')])
        # own item in Evening
        await pg.click('.dblock >> nth=2'); await pg.click('text=Add to Evening'); await pg.fill('input[data-h="Name"]','Night walk Omoide Yokocho'); await pg.fill('input[data-h="Time"]','20:00'); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(300)
        # Tickets chip
        print('D2 chips:',await chips(pg))
        # Food via the Food tab with a planned day -> shows at once
        if await pg.is_visible('.sheetbox'): await pg.click('.sheetbox button.btn:text-is("Close")')
        await pg.click('.tab[data-id=food]'); await pg.click('.cbody >> text=Ichiran'); await pg.select_option('select[data-h="Planned day"]','2027-04-09'); await pg.fill('input[data-h="Planned time"]','19:30'); await pg.click('.sheetbox button.primary')
        await pg.click('.tab[data-id=days]'); print('D2 blocks w/ food:',await blocks(pg))
        # transport same city vs between cities
        post({'action':'push','ops':[{'sheet':'Transport','rid':'t1','isNew':True,'v':{'Date':'2027-04-09','Departs':'08:00','From':'Shinjuku','To':'Odaiba','Origin city':'Tokyo','Destination city':'Tokyo'}},
          {'sheet':'Transport','rid':'t2','isNew':True,'v':{'Date':'2027-04-09','Departs':'21:00','From':'Tokyo st','To':'Kyoto st','Origin city':'Tokyo','Destination city':'Kyoto'}}]})
        await pg.click('#pill'); await pg.wait_for_timeout(2000)
        print('D2 blocks w/ transport:',await blocks(pg)); print('D2 chips:',await chips(pg))
        # expenses
        await pg.click('.addexp'); await pg.wait_for_timeout(200)
        print('exp form labels:',await pg.eval_on_selector_all('.sheetbox label','e=>e.filter(x=>x.offsetParent).map(x=>x.textContent)'),'| note:',await pg.inner_text('.sheetbox p.note'))
        print('defaults: cur',await pg.input_value('#f_Currency'),'city',await pg.input_value('select[data-h=City]'))
        await pg.fill('input[data-h=Name]','Ramen lunch'); await pg.select_option('select[data-h=Category]','Other'); print('other visible:',await pg.is_visible('input[data-h="Other category"]'))
        await pg.fill('input[data-h="Other category"]','Snacks'); await pg.click('.sheetbox button.primary'); print('no price toast:',await pg.inner_text('#toast'))
        await pg.fill('#f_Price','1,200'); await pg.fill('input[data-h=Place]','Lawson'); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(300)
        await pg.click('.addexp'); await pg.fill('input[data-h=Name]','eSIM'); await pg.select_option('select[data-h=Category]','Connectivity (eSIM / Wi-Fi)'); await pg.fill('#f_Price','40'); await pg.select_option('#f_Currency','USD'); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(300)
        print('D2 chips after exp:',(await chips(pg))[-3:])
        await pg.screenshot(path='v28_day2.png')
        await pg.click('.chip.sm >> text=Spent today'); await pg.wait_for_timeout(300); print('expenses tab:',await pg.inner_text('.top h1'),'|',await pg.inner_text('.expsum'))
        await pg.screenshot(path='v28_exp.png')
        await pg.click('.segb >> text=Whole trip'); await pg.select_option('select[aria-label="All categories"]','Snacks'); print('filtered:',await pg.inner_text('.expsum'))
        fab=await pg.evaluate("(()=>{const f=document.querySelector('.fab').getBoundingClientRect(),m=document.querySelector('.tab.more').getBoundingClientRect();return [Math.round(f.bottom),Math.round(m.top),Math.round(f.left),Math.round(m.left)]})()"); print('fab bottom vs More top:',fab)
        await pg.click('.cbody >> text=Ramen lunch'); print('edit form has date:',await pg.input_value('input[data-h=Date]'),await pg.input_value('input[data-h=Time]')); await pg.click('.sheetbox >> text=Cancel')
        await pg.wait_for_timeout(2500); print('sheet Expenses:',rows('Expenses'))
        await pg.click('.tab[data-id=days]')
        fit=await pg.evaluate("(()=>{const m=document.querySelector('.main');return [m.clientHeight,m.scrollHeight]})()"); print('fit 360x740:',fit)
        # Itinerary tab
        await pg.click('.tab.more'); await pg.click('.gridbtn >> text=Itinerary'); await pg.wait_for_timeout(300)
        print('itin day2:',await pg.eval_on_selector('#iday-1','e=>e.innerText.replace(/\\n/g," | ")'))
        await pg.screenshot(path='v28_itin.png')
        # auto item form: open Senso-ji, notes, remove
        await pg.click('#iday-1 .pmain >> text=Senso-ji'); await pg.wait_for_timeout(200)
        print('auto form:',await pg.eval_on_selector_all('.sheetbox button, .sheetbox label','e=>e.map(x=>x.textContent)'))
        await pg.click('text=Remove from this day'); await pg.wait_for_timeout(300)
        print('itin day2 after remove:',await pg.eval_on_selector('#iday-1','e=>e.innerText.replace(/\\n/g," | ")'))
        await pg.wait_for_timeout(2500)
        print('sheet Places:',[ (r['Place name'],r.get('Planned day'),r.get('Planned time')) for r in rows('Places')], '| itin names', [r.get('Name') for r in rows('Itinerary')])
        # tap day header -> Days at that day
        await pg.screenshot(path='v28_itin.png')
        await pg.click('#iday-3 .ihead'); print('header->',await pg.inner_text('.daytitle .big'))
        # cityForm: day 1 hotels locked; day 6 free, carry forward
        await pg.click('[aria-label="Previous day"]'); await pg.click('[aria-label="Previous day"]'); await pg.click('[aria-label="Previous day"]'); await pg.click('.citychip >> nth=0'); await pg.wait_for_timeout(200)
        print('D1 hotel selects disabled:',await pg.eval_on_selector_all('.sheetbox select#starthotel, .sheetbox select#endhotel','e=>e.map(x=>[x.id,x.value,x.disabled])'))
        await pg.click('.sheetbox >> text=Cancel')
        for i in range(5): await pg.click('[aria-label="Next day"]')
        print('now at',await pg.inner_text('.daytitle .big')); await pg.click('.citychip >> nth=0'); await pg.wait_for_timeout(200)
        print('D6 start hotel',await pg.eval_on_selector_all('.sheetbox select#starthotel, .sheetbox select#endhotel','e=>e.map(x=>[x.id,x.value,x.disabled])'), await pg.inner_text('label[for=starthotel]'))
        await pg.select_option('select[data-h="Starts in"]','Tokyo') if False else None
        await pg.select_option('#endhotel','Kyoto Granbell'); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(300); print('toast:',await pg.inner_text('#toast'))
        await pg.wait_for_timeout(2500)
        print('sheet Days hotels:',[(r['Date'][5:],r.get('Start hotel',''),r.get('End hotel','')) for r in rows('Days')][:10])
        await pg.click('.routebtn'); u=(await pg.evaluate('window.__opened')) ; print('route d6:',urllib.parse.unquote(u[-1]) if u else await pg.inner_text('#toast'))
        # name from a Maps short link
        await pg.goto(B+'?url='+urllib.parse.quote('https://maps.app.goo.gl/ich')); await pg.wait_for_selector('#ideaname'); await pg.wait_for_timeout(500)
        print('prefilled name:',await pg.input_value('#ideaname')); await pg.click('.sheetbox button.primary'); await pg.wait_for_timeout(500)
        # 390 size fit
        await pg.set_viewport_size({'width':390,'height':763}); await pg.click('.tab[data-id=days]'); await pg.wait_for_timeout(200)
        print('fit 390x763:',await pg.evaluate("(()=>{const m=document.querySelector('.main');return [m.clientHeight,m.scrollHeight]})()"))
        # Excel copy
        await pg.click('.tab.more'); await pg.click('text=Settings')
        async with pg.expect_download() as dl: await pg.click('text=Download an Excel copy')
        d=await dl.value; await d.save_as('export28.xlsx'); print('excel saved')
        print('errors',errs); await b.close()
asyncio.run(main())
