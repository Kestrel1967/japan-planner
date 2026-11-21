import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.workbook.defined_name import DefinedName

F='Arial'
wb=Workbook()
MAXR=600
INK='3B4252'
def fill(c): return PatternFill('solid',start_color=c,end_color=c)
thin=Side(style='thin',color='D9D9D9')
BORDER=Border(left=thin,right=thin,top=thin,bottom=thin)
AUTO_FILL=fill('F2F2F2')
# palettes: (header pastel, title band, tab, table style)
PAL={'blue':('BDD7EE','DDEBF7','9DC3E6','TableStyleLight2'),
     'rose':('F4CCCC','FBE5E5','EA9999','TableStyleLight3'),
     'green':('D5E8C8','EAF3E3','A9D08E','TableStyleLight4'),
     'purple':('D9D2E9','ECE8F4','B4A7D6','TableStyleLight5'),
     'aqua':('C9E7EC','E4F3F5','92CDDC','TableStyleLight6'),
     'orange':('FCE0C5','FEF0E2','F6B26B','TableStyleLight7'),
     'grey':('E0E0E0','F2F2F2','BFBFBF','TableStyleLight1')}

# ---------------- Lists ----------------
LISTS=[
 ('Travellers','L_Travellers',['Kuti','Partner','Both']),
 ('Cities (type yours)','L_Cities',[]),
 ('Yes / No','L_YesNo',['Yes','No']),
 ('Booking status','L_Status',['To book','Pending','Booked','Paid','Cancelled']),
 ('Task status','L_TaskStatus',['Not started','In progress','Done']),
 ('Priority','L_Priority',['Must','Want','If time']),
 ('Flight leg type','L_FlightType',['Outbound','Connection','Return','Domestic']),
 ('Day type','L_DayType',['Arrival','Sightseeing','Day trip','Travel day','Rest / flex','Departure']),
 ('Transport type','L_Transport',['Shinkansen','Train','Subway / metro','Bus','Airport transfer','Taxi','Ferry','Domestic flight','Car rental','Pass / IC card','Luggage forwarding','Other']),
 ('Place category','L_PlaceCat',['Temple / shrine','Castle / historic','Museum / art','Garden / park','Nature / hike','Viewpoint','Neighbourhood / street','Market','Shopping','Onsen','Theme park / fun','Experience / workshop','Nightlife','Day trip','Other']),
 ('Food type','L_FoodType',['Restaurant','Izakaya','Ramen / noodles','Sushi','Street food','Café','Bakery / dessert','Bar','Market / food hall','Konbini / quick','Other']),
 ('Price range','L_Price',['¥','¥¥','¥¥¥','¥¥¥¥']),
 ('Booking type','L_BookType',['Attraction','Restaurant','Experience / tour','Show / event','Transport','Other']),
 ('Budget category','L_BudgetCat',['Flights','Accommodation','Transport in Japan','Food & drink','Attractions & activities','Shopping','Insurance','Connectivity (eSIM / Wi-Fi)','Other']),
 ('Currency','L_Currency',['JPY','ILS','EUR','USD']),
 ('Payment method','L_PayMethod',['Credit card','Cash','IC card','Mobile pay','Other']),
 ('Packing category','L_PackCat',['Clothes','Shoes','Toiletries','Medicine & health','Electronics','Documents & money','Comfort / flight','Other']),
 ('Bag','L_Bag',['Checked (23 kg)','Carry-on','Personal item','Wear on flight']),
 ('To-do category','L_TodoCat',['Documents','Insurance','Money','Connectivity','Health','Bookings','Home prep','Other']),
 ('App category','L_AppCat',['Navigation & maps','Trains & transit','Translation','Payments','Food & reservations','Accommodation','Flights','Connectivity','Weather & safety','Tickets & attractions','Taxi & rides','Shopping','Other']),
 ('Platform','L_Platform',['Android','iPhone','Both']),
 ('App cost','L_AppCost',['Free','Paid','Free + in-app']),
 ('Shopping category','L_ShopCat',['Souvenirs','Gifts','Food & snacks','Clothes','Electronics','Cosmetics','Kitchen / knives','Stationery','Anime / games','Other']),
 ('Info topic','L_InfoTopic',['Entry & documents','Money & payments','Connectivity','Etiquette & customs','Safety & health','Weather','Holidays & closures','Luggage','Getting around','Other']),
 ('Phrase category','L_PhraseCat',['Basics','Restaurant','Transport','Shopping','Hotel','Emergency','Other']),
 ('Contact type','L_ContactType',['Emergency service','Embassy / consulate','Insurance','Hotel','Airline','Bank / card','Family / home','Doctor / pharmacy','Other']),
 ('Rating','L_Rating',['★','★★','★★★','★★★★','★★★★★']),
]
LCOL={}  # name -> column letter
L0=4; LEND=60
for i,(h,n,items) in enumerate(LISTS): LCOL[n]=CL(i+1)
def lcell(name,idx): return f"Lists!${LCOL[name]}${L0+idx}"

ws0=wb.active; ws0.title='Start Here'
SHEETS=[]  # (name, description, palette)

def base(ws,title,hint,pal,ncols):
    hp,tp,tab,_=PAL[pal]
    ws.sheet_properties.tabColor=tab
    ws.sheet_view.showGridLines=False
    for c in range(1,max(ncols,8)+1):
        ws.cell(1,c).fill=fill(hp); ws.cell(2,c).fill=fill(tp); ws.cell(3,c).fill=fill(tp)
    ws['A1']=title; ws['A1'].font=Font(name=F,size=16,bold=True,color=INK)
    ws['A2']=hint; ws['A2'].font=Font(name=F,size=9,italic=True,color='595959')
    ws['A1'].alignment=Alignment(vertical='center'); ws['A2'].alignment=Alignment(vertical='center')
    ws.row_dimensions[1].height=30; ws.row_dimensions[2].height=18; ws.row_dimensions[3].height=16
    if ws.title!='Start Here':
        ws['A3']='◄ Back to Start Here'; ws['A3'].hyperlink="#'Start Here'!A1"
        ws['A3'].font=Font(name=F,size=9,underline='single',color='2F5597')
    ws.page_setup.orientation='landscape'; ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0
    ws.sheet_properties.pageSetUpPr.fitToPage=True

STATUS_CF=[('Booked','E2F0D9','375623'),('Paid','E2F0D9','375623'),('Done','E2F0D9','375623'),('Yes','E2F0D9','375623'),
           ('Pending','FFF2CC','7F6000'),('In progress','FFF2CC','7F6000'),
           ('To book','FCE4D6','843C0C'),('Not started','FCE4D6','843C0C'),
           ('Cancelled','EDEDED','7F7F7F'),
           ('Must','F8D7DA','842029'),('Want','FFF2CC','7F6000'),('If time','E7EEF7','44546A')]

def make(name,title,hint,pal,cols,nrows,desc,hr=4,freeze_cols=1,row_h=None,table=True):
    """cols: list of dict(h, w, k, [list], [f], [cf])  k: text|wrap|date|time|money|num|int|list|auto|link"""
    ws=wb.create_sheet(name); SHEETS.append((name,desc,pal))
    base(ws,title,hint,pal,len(cols))
    hp=PAL[pal][0]
    for j,c in enumerate(cols,1):
        L=CL(j)
        ws.column_dimensions[L].width=c['w']
        h=ws.cell(hr,j,c['h']); h.font=Font(name=F,size=10,bold=True,color=INK); h.fill=fill(hp)
        h.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True); h.border=BORDER
        k=c['k']
        for r in range(hr+1,hr+nrows+1):
            cell=ws.cell(r,j); cell.font=Font(name=F,size=10); cell.border=BORDER
            cell.alignment=Alignment(vertical='center',wrap_text=(k in('wrap','text','link')),
                                     horizontal='center' if k in('date','time','list','int','auto') else None)
            if k=='date': cell.number_format=c.get('fmt','ddd dd-mmm-yy')
            elif k=='time': cell.number_format='hh:mm'
            elif k=='money': cell.number_format='#,##0.00;-#,##0.00'
            elif k=='num': cell.number_format='0.0'
            elif k=='int': cell.number_format='0'
            elif k=='auto':
                cell.value=c['f'](r); cell.fill=AUTO_FILL
                cell.font=Font(name=F,size=10,italic=True,color='595959'); cell.number_format=c.get('fmt','General')
            if 'v' in c: cell.value=c['v'](r)
            if row_h: ws.row_dimensions[r].height=row_h
        rng=f"{L}{hr+1}:{L}{MAXR}"
        if k=='list':
            soft=c.get('soft',False)
            dv=DataValidation(type='list',formula1='='+c['list'],allow_blank=True,
                              errorStyle='warning' if soft else 'stop')
            dv.errorTitle='Not in the list'
            dv.error=('This value is not in the list yet. You can keep it, or add it in the "Lists" sheet so it appears in the dropdown.'
                      if soft else 'Please pick from the dropdown. To add an option, type it in the "Lists" sheet.')
            dv.showErrorMessage=True
            ws.add_data_validation(dv); dv.add(rng)
            if c.get('cf',True):
                for val,bg,fg in STATUS_CF:
                    ws.conditional_formatting.add(rng,CellIsRule(operator='equal',formula=[f'"{val}"'],fill=fill(bg),font=Font(name=F,color=fg)))
        if k=='date':
            dv=DataValidation(type='date',operator='greaterThan',formula1='40000',allow_blank=True,errorStyle='warning')
            dv.errorTitle='Date expected'; dv.error='Enter a date, e.g. 08/04/2027.'
            ws.add_data_validation(dv); dv.add(rng)
    ws.row_dimensions[hr].height=34
    if table:
        t=Table(displayName='tbl'+''.join(ch for ch in name if ch.isalnum()),ref=f"A{hr}:{CL(len(cols))}{hr+nrows}")
        t.tableStyleInfo=TableStyleInfo(name=PAL[pal][3],showRowStripes=True,showColumnStripes=False,showFirstColumn=False,showLastColumn=False)
        ws.add_table(t)
    ws.freeze_panes=ws.cell(hr+1,freeze_cols+1)
    return ws

def T(h,w=18): return dict(h=h,w=w,k='text')
def W(h,w=36): return dict(h=h,w=w,k='wrap')
def D(h,w=15,fmt='ddd dd-mmm-yy'): return dict(h=h,w=w,k='date',fmt=fmt)
def TM(h,w=10): return dict(h=h,w=w,k='time')
def M(h,w=13): return dict(h=h,w=w,k='money')
def N(h,w=10): return dict(h=h,w=w,k='num')
def I(h,w=8): return dict(h=h,w=w,k='int')
def Ls(h,l,w=16,soft=False,cf=True): return dict(h=h,w=w,k='list',list=l,soft=soft,cf=cf)
def A(h,f,w=12,fmt='General'): return dict(h=h,w=w,k='auto',f=f,fmt=fmt)
CITY=lambda h='City': Ls(h,'L_Cities',16,soft=True,cf=False)
CUR=lambda: Ls('Currency','L_Currency',10,cf=False)
DAY=lambda h='Planned day': dict(h=h,w=14,k='list',list='L_TripDates',soft=True,cf=False)

# ---------------- Flights ----------------
make('Flights','✈  Flights','One row per flight leg, in travel order. Times are local to each airport.','blue',[
 I('Leg #',7),Ls('Leg type','L_FlightType',13,cf=False),D('Departure date'),T('Airline',16),T('Flight no.',11),T('From (airport)',16),T('To (airport)',16),
 TM('Departs (local)',11),D('Arrival date'),TM('Arrives (local)',11),T('Duration',10),T('Terminal',10),T('Booking ref (PNR)',16),T('Booked via',16),
 T('Seats',10),T('Baggage allowance',20),M('Price (total)'),CUR(),D('Online check-in opens',16),Ls('Status','L_Status',12),W('Notes',40)],
 20,'Every flight leg: times, booking refs, seats, baggage, price',freeze_cols=2)

# ---------------- Itinerary ----------------
d0=dt.date(2027,4,8)
ws=make('Days','🗓  Days  ·  8 – 30 April 2027','One row per day. Dates and weekdays are pre-set. The app writes a summary of each day\'s plan here; the items themselves are in the Itinerary sheet.','rose',[
 dict(h='Day',w=6,k='int',v=lambda r:r-4),
 dict(h='Date',w=12,k='date',fmt='dd-mmm-yy',v=lambda r:d0+dt.timedelta(days=r-5)),
 A('Weekday',lambda r:f'=B{r}',11,'dddd'),
 Ls('Day type','L_DayType',13,cf=False),CITY('Starts in'),T('Start hotel',22),CITY('Ends in'),T('End hotel',22),
 W('Morning',34),W('Afternoon',34),W('Evening',34),W('Food plans',26),W('Transport today',26),W('Tickets to book',24),W('Any time',26),M('Est. cost'),M('Actual cost'),CUR(),W('Notes',36)],
 23,'Day-by-day overview: cities, hotels and a summary of each part of the day',freeze_cols=3,row_h=48)
# soft weekend tint on Day/Date/Weekday
ws.conditional_formatting.add('A5:C27',FormulaRule(formula=['WEEKDAY($B5)=7'],fill=fill('FFF2CC')))
wb.defined_names['L_TripDates']=DefinedName('L_TripDates',attr_text="Days!$B$5:$B$27")

# ---------------- Itinerary (one row per planned item) ----------------
make('Itinerary','🧭  Itinerary','Everything planned, one row per item, in day and hour order. Items with a date in Places, Food, Shopping, Attractions, Transport and Flights appear here by themselves.','rose',[
 DAY('Date'),TM('Time'),T('Part',12),T('Name',30),T('Type',12),dict(h='Map link',w=24,k='link'),dict(h='Website',w=24,k='link'),W('Notes',36)],
 300,'Every planned item by day and hour',freeze_cols=2)

# ---------------- Hotels ----------------
make('Hotels','🏨  Hotels','Listed in stay order. Nights are calculated automatically from check-in / check-out.','green',[
 I('Stay #',7),CITY(),T('Hotel name',26),D('Check-in'),D('Check-out'),
 A('Nights',lambda r:f'=IF(OR(D{r}="",E{r}=""),"",E{r}-D{r})',8,'0'),
 T('District / ward',16),T('Neighbourhood',16),W('Address (English)',30),W('Address (Japanese)',30),T('Nearest station',18),
 TM('Check-in from',10),TM('Check-out by',10),T('Booked via',14),T('Confirmation #',16),M('Price (total)'),CUR(),
 Ls('Paid?','L_YesNo',9),D('Free cancellation until',16),Ls('Breakfast incl.?','L_YesNo',10,cf=False),T('Room type',16),T('Phone',16),
 dict(h='Map link',w=24,k='link'),dict(h='Booking link',w=24,k='link'),Ls('Status','L_Status',12),W('Notes',40)],
 15,'Stays in order: dates, nights, address, confirmation, price',freeze_cols=3)

# ---------------- Transport ----------------
make('Transport','🚄  Transport in Japan','Trains, Shinkansen, airport transfers, passes and IC cards. Filter by Type or Date.','purple',[
 I('#',6),D('Date'),Ls('Type','L_Transport',18,cf=False),T('From',18),T('To',18),CITY('Origin city'),CITY('Destination city'),TM('Departs'),TM('Arrives'),T('Duration',10),
 T('Operator / line',18),T('Train name / no.',16),Ls('Seat reservation needed?','L_YesNo',13,cf=False),Ls('Reserved?','L_YesNo',11),
 Ls('Covered by pass?','L_YesNo',11,cf=False),M('Cost'),CUR(),T('Booking ref',14),T('Luggage note',20),Ls('Status','L_Status',12),W('Notes',40)],
 40,'Trains, transfers, passes and IC cards per leg',freeze_cols=3)

# ---------------- Places ----------------
make('Places','📍  Places to Visit','Wish-list of sights. Filter with the arrows on City / District / Neighbourhood / Category / Priority.','aqua',[
 T('Place name',28),Ls('Category','L_PlaceCat',20,cf=False),CITY(),T('District / ward',16),T('Neighbourhood',16),T('Nearest station',18),
 Ls('Priority','L_Priority',10),DAY(),TM('Planned time'),T('Time needed',11),T('Best time to go',16),T('Opening hours',16),T('Closed on',12),
 M('Entry fee'),CUR(),Ls('Booking needed?','L_YesNo',11,cf=False),T('Recommended by / source',22),dict(h='Map link',w=22,k='link'),
 Ls('Visited?','L_YesNo',10),Ls('Our rating','L_Rating',11,cf=False),W('Notes',40)],
 150,'Sights wish-list with city / district / neighbourhood filters',freeze_cols=1)

# ---------------- Food ----------------
make('Food','🍜  Restaurants & Food','Food wish-list with the same location filters as Places.','orange',[
 T('Name',28),Ls('Type','L_FoodType',18,cf=False),T('Cuisine / must-try dish',24),CITY(),T('District / ward',16),T('Neighbourhood',16),T('Nearest station',18),
 Ls('Price range','L_Price',9,cf=False),Ls('Priority','L_Priority',10),DAY(),TM('Planned time'),Ls('Reservation needed?','L_YesNo',12,cf=False),Ls('Reserved?','L_YesNo',11),
 T('Opening hours',16),T('Closed on',12),Ls('Cash only?','L_YesNo',9,cf=False),T('Dietary notes',20),T('Recommended by / source',22),
 dict(h='Map link',w=22,k='link'),Ls('Visited?','L_YesNo',10),Ls('Our rating','L_Rating',11,cf=False),W('Notes',40)],
 100,'Restaurants, cafés and street food wish-list',freeze_cols=1)

# ---------------- Bookings ----------------
ws=make('Attractions','🎟  Attractions & Tickets','Things to reserve ahead. "Days left" counts down to the Book-by date and turns red when 7 days or fewer remain.','blue',[
 T('What',28),Ls('Type','L_BookType',16,cf=False),CITY(),D('Visit date'),TM('Time'),D('Booking opens'),D('Book by (deadline)'),
 A('Days left',lambda r:f'=IF(G{r}="","",G{r}-TODAY())',9,'0'),
 dict(h='Where to book (link)',w=26,k='link'),M('Price (total)'),CUR(),Ls('Booked by','L_Travellers',11,cf=False),T('Confirmation #',16),
 T('Tickets saved where',20),Ls('Status','L_Status',12),W('Notes',40)],
 50,'Tickets and reservations to make, with deadlines and status',freeze_cols=1)
ws.conditional_formatting.add(f'H5:H{MAXR}',FormulaRule(formula=['AND(ISNUMBER($H5),$H5<=7,$O5<>"Booked",$O5<>"Paid",$O5<>"Cancelled")'],fill=fill('F8D7DA'),font=Font(name=F,color='842029',bold=True)))

# ---------------- Budget ----------------
HR=22
ws=make('Expenses','💰  Expenses','Every expense in its own currency. The app fills date and time when you save. Fill the exchange rates once (yellow cells) and the summary converts to your home currency.','green',[
 T('Name',30),Ls('Category','L_BudgetCat',26,cf=False),T('Other category',18),M('Price',12),CUR(),
 A('Price (home currency)',lambda r:f'=IF(OR(D{r}="",E{r}=""),"",IFERROR(IF(INDEX($J$7:$J$12,MATCH(E{r},$I$7:$I$12,0))="","",D{r}*INDEX($J$7:$J$12,MATCH(E{r},$I$7:$I$12,0))),""))',15,'#,##0'),
 Ls('Paid by','L_Travellers',14,cf=False),CITY('City'),T('Place',22),D('Date',14),TM('Time'),W('Notes',36)],
 300,'Every expense of the trip, with totals by category in your home currency',hr=HR,freeze_cols=0)
ws.freeze_panes='A4'
hp=PAL['green'][0]
def hdr(c,v):
    ws[c]=v; ws[c].font=Font(name=F,size=10,bold=True,color=INK); ws[c].fill=fill(hp); ws[c].border=BORDER
    ws[c].alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
def sec(c,v): ws[c]=v; ws[c].font=Font(name=F,size=11,bold=True,color=INK)
def auto(c,v,fmt='#,##0'):
    ws[c]=v; ws[c].fill=AUTO_FILL; ws[c].font=Font(name=F,size=10,italic=True,color='595959'); ws[c].border=BORDER; ws[c].number_format=fmt
INPUT=fill('FFF8DC')
sec('B5','Spent by category (home currency)')
for c,v in zip('BCD',['Category','Spent','% of total']): hdr(c+'6',v)
ws.row_dimensions[6].height=28
def R(col): return f'${col}${HR+1}:${col}${MAXR}'
for i in range(12):
    r=7+i; src=lcell('L_BudgetCat',i)
    auto(f'B{r}',f'=IF({src}="","",{src})','General')
    auto(f'C{r}',f'=IF(B{r}="","",SUMIFS({R("F")},{R("B")},B{r}))')
    auto(f'D{r}',f'=IF(OR(B{r}="",$C$19=0),"",C{r}/$C$19)','0%')
auto('B19','TOTAL','General'); auto('C19','=SUM(C7:C18)'); auto('D19','=IF(C19=0,"",1)','0%')
for c in 'BCD': ws[c+'19'].font=Font(name=F,size=10,bold=True,color=INK)
sec('I5','Exchange rates'); hdr('I6','Currency'); hdr('J6','1 unit = ? in home currency')
for i in range(6):
    r=7+i; src=lcell('L_Currency',i)
    auto(f'I{r}',f'=IF({src}="","",{src})','General')
    ws[f'J{r}'].fill=INPUT; ws[f'J{r}'].border=BORDER; ws[f'J{r}'].font=Font(name=F,size=10); ws[f'J{r}'].number_format='0.0000'
ws['K7']='◄ type today\'s rates here (your home currency = 1)'; ws['K7'].font=Font(name=F,size=9,italic=True,color='7F6000')
sec('I14','Who paid (actual, home currency)'); hdr('I15','Paid by'); hdr('J15','Total')
for i in range(3):
    r=16+i; src=lcell('L_Travellers',i)
    auto(f'I{r}',f'=IF({src}="","",{src})','General')
    auto(f'J{r}',f'=IF(I{r}="","",SUMIFS({R("H")},{R("I")},I{r}))')
sec('A21','Expense log')

# ---------------- Packing ----------------
HR=11
ws=make('Packing','🧳  Packing List','One row per item. Add weights if you want the bag totals above to track the 23 kg checked-bag limit.','purple',[
 T('Item',30),Ls('Category','L_PackCat',20,cf=False),Ls('Person','L_Travellers',14,cf=False),Ls('Bag','L_Bag',17,cf=False),I('Qty',15),
 dict(h='Weight each (kg)',w=15,k='money'),
 A('Total weight (kg)',lambda r:f'=IF(OR(E{r}="",F{r}=""),"",E{r}*F{r})',15,'0.00'),
 Ls('Need to buy?','L_YesNo',12,cf=False),Ls('Packed?','L_YesNo',10),W('Notes',40)],
 120,'Per-person packing checklist with carry-on / 23 kg checked-bag weight tracking',hr=HR,freeze_cols=0)
ws.freeze_panes='A4'
hp=PAL['purple'][0]
for c,v in zip('ABCDEFG',['Bag weight tracker','Checked bag (kg)','Checked limit (kg)','Checked – kg left','Carry-on (kg)','Carry-on limit (kg)','Carry-on – kg left']): hdr(c+'5',v)
ws.row_dimensions[5].height=30
bag_checked=lcell('L_Bag',0); bag_carry=lcell('L_Bag',1)
def R(col): return f'${col}${HR+1}:${col}${MAXR}'
for i in range(3):
    r=6+i; src=lcell('L_Travellers',i)
    auto(f'A{r}',f'=IF({src}="","",{src})','General')
    auto(f'B{r}',f'=IF(A{r}="","",SUMIFS({R("G")},{R("C")},A{r},{R("D")},{bag_checked}))','0.0')
    for c in 'CF':
        ws[f'{c}{r}'].fill=INPUT; ws[f'{c}{r}'].border=BORDER; ws[f'{c}{r}'].font=Font(name=F,size=10); ws[f'{c}{r}'].number_format='0.0'; ws[f'{c}{r}'].alignment=Alignment(horizontal='center')
    if i<2: ws[f'C{r}']=23
    auto(f'D{r}',f'=IF(OR(A{r}="",C{r}=""),"",C{r}-B{r})','0.0')
    auto(f'E{r}',f'=IF(A{r}="","",SUMIFS({R("G")},{R("C")},A{r},{R("D")},{bag_carry}))','0.0')
    auto(f'G{r}',f'=IF(OR(A{r}="",F{r}=""),"",F{r}-E{r})','0.0')
ws['H6']='◄ 23 kg checked limit as you specified; type your airline\'s carry-on limit in the yellow cells'
ws['H6'].font=Font(name=F,size=9,italic=True,color='7F6000')
for rg in ('D6:D8','G6:G8'):
    ws.conditional_formatting.add(rg,CellIsRule(operator='lessThan',formula=['0'],fill=fill('F8D7DA'),font=Font(name=F,color='842029',bold=True)))
sec('A10','Packing items')

# ---------------- To-Do ----------------
make('To-Do & Docs','✅  Pre-trip To-Do & Documents','Everything to sort out before flying. Filter by Owner or Status.','aqua',[
 T('Task / document',34),Ls('Category','L_TodoCat',16,cf=False),Ls('Owner','L_Travellers',11,cf=False),D('Due date'),
 A('Days left',lambda r:f'=IF(D{r}="","",D{r}-TODAY())',9,'0'),
 Ls('Priority','L_Priority',10),Ls('Status','L_TaskStatus',13),dict(h='Link',w=24,k='link'),T('Where it is saved',22),W('Notes',40)],
 50,'Pre-trip tasks and documents with owner, due date and status',freeze_cols=1)

# ---------------- Apps ----------------
make('Apps','📱  Apps to Download','Filter by Category. Tick off who has installed and set up each app.','orange',[
 T('App name',24),Ls('Category','L_AppCat',22,cf=False),W('What we use it for',36),Ls('Platform','L_Platform',11,cf=False),Ls('Cost','L_AppCost',13,cf=False),
 Ls('Works offline?','L_YesNo',10,cf=False),Ls('Needs account / setup before trip?','L_YesNo',15,cf=False),Ls('Priority','L_Priority',10),
 Ls('Installed – traveller 1','L_YesNo',12),Ls('Installed – traveller 2','L_YesNo',12),dict(h='iPhone download',w=24,k='link'),dict(h='Android download',w=24,k='link'),dict(h='Other link',w=24,k='link'),W('Notes',40)],
 50,'Apps to install, with category filter and per-person install check',freeze_cols=1)

# ---------------- Shopping ----------------
make('Shopping','🛍  Shopping & Souvenirs','Wish-list of things to buy, with where to find them.','rose',[
 T('Item',28),Ls('Category','L_ShopCat',16,cf=False),T('For whom',16),T('Shop / brand',20),CITY(),T('District / ward',16),T('Neighbourhood',16),
 M('Est. price'),CUR(),Ls('Tax-free eligible?','L_YesNo',11,cf=False),Ls('Priority','L_Priority',10),DAY(),TM('Planned time'),Ls('Bought?','L_YesNo',10),M('Actual price'),W('Notes',40)],
 60,'Shopping wish-list with shop, area, price and tax-free flag',freeze_cols=1)

# ---------------- Important Info ----------------
make('Important Info','ℹ️  General Important Info','Rules, tips and facts worth having in one place. Filter by Topic.','blue',[
 Ls('Topic','L_InfoTopic',20,cf=False),T('Title',28),W('Details',60),dict(h='Source / link',w=28,k='link'),D('Checked on',14),Ls('Important?','L_YesNo',11),W('Notes',36)],
 60,'Entry rules, money, connectivity, etiquette and other key facts',freeze_cols=1,row_h=30)

# ---------------- Phrases ----------------
make('Phrases','🗣  Useful Japanese Phrases','Phrases to show or say. Filter by Category.','green',[
 Ls('Category','L_PhraseCat',14,cf=False),T('English',34),T('Japanese (to show)',34),T('Pronunciation (romaji)',34),W('Notes',36)],
 60,'Japanese phrases by situation',freeze_cols=1)

# ---------------- Emergency ----------------
make('Emergency','🆘  Emergency & Contacts','Key numbers and contacts. Avoid storing passport or card numbers in a shared file.','rose',[
 Ls('Type','L_ContactType',20,cf=False),T('Name',26),T('Phone',18),W('Address',32),dict(h='Email / website',w=26,k='link'),T('When to use',26),T('Policy / reference no.',20),W('Notes',36)],
 30,'Emergency numbers, embassy, insurance and other contacts',freeze_cols=1)

# ---------------- Lists sheet ----------------
wl=wb.create_sheet('Lists'); SHEETS.append(('Lists','All dropdown options – edit, add or rename them here','grey'))
base(wl,'⚙  Lists (dropdown options)','Every dropdown in the workbook reads from here. Type new options under a column (no gaps) and they appear in the dropdowns. Rename the travellers and add your cities.','grey',len(LISTS))
for i,(h,n,items) in enumerate(LISTS,1):
    L=CL(i); wl.column_dimensions[L].width=24
    c=wl.cell(3,i,h); c.font=Font(name=F,size=10,bold=True,color=INK); c.fill=fill('E0E0E0'); c.border=BORDER
    c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
    for r in range(L0,LEND+1):
        cc=wl.cell(r,i); cc.font=Font(name=F,size=10); cc.border=BORDER
        if r-L0<len(items): cc.value=items[r-L0]
    if n=='L_Cities':
        for r in range(L0,LEND+1): wl.cell(r,i).fill=INPUT
    wb.defined_names[n]=DefinedName(n,attr_text=f"OFFSET(Lists!${L}${L0},0,0,MAX(1,COUNTA(Lists!${L}${L0}:${L}${LEND})),1)")
wl.row_dimensions[3].height=30
wl['A3'].hyperlink=None
wl.cell(2,1).value=wl['A2'].value
wl.freeze_panes='A4'
# back link for Lists lives in row 3 header normally; put it in title row end instead
wl['A3']=LISTS[0][0]
wl['E1']='◄ Back to Start Here'; wl['E1'].hyperlink="#'Start Here'!A1"; wl['E1'].font=Font(name=F,size=9,underline='single',color='2F5597')

# ---------------- Start Here ----------------
ws=ws0
base(ws,'🇯🇵  Japan Trip Planner  ·  8 – 30 April 2027','Shared planning workbook – one tab per topic. Click a sheet name below to jump to it.','rose',5)
ws.column_dimensions['A'].width=24; ws.column_dimensions['B'].width=70; ws.column_dimensions['C'].width=16; ws.column_dimensions['D'].width=16; ws.column_dimensions['E'].width=16
def lab(c,v,b=True): ws[c]=v; ws[c].font=Font(name=F,size=10,bold=b,color=INK); ws[c].alignment=Alignment(vertical='center',wrap_text=True)
lab('A5','Trip start'); ws['B5']=dt.date(2027,4,8); lab('A6','Trip end'); ws['B6']=dt.date(2027,4,30)
lab('A7','Trip length (days)'); ws['B7']='=B6-B5+1'
lab('A8','Days until departure'); ws['B8']='=MAX(0,B5-TODAY())'
for r in (5,6): ws[f'B{r}'].number_format='dddd, dd mmmm yyyy'
for r in (5,6,7,8):
    ws[f'B{r}'].font=Font(name=F,size=10,italic=True,color='595959'); ws[f'B{r}'].fill=AUTO_FILL; ws[f'B{r}'].alignment=Alignment(horizontal='left'); ws[f'B{r}'].border=BORDER
ws['A10']='Sheets'; ws['A10'].font=Font(name=F,size=12,bold=True,color=INK)
r=11
for name,desc,pal in SHEETS:
    a=ws.cell(r,1,name); a.hyperlink=f"#'{name}'!A1"; a.font=Font(name=F,size=10,bold=True,underline='single',color='2F5597')
    a.fill=fill(PAL[pal][0]); a.border=BORDER
    b=ws.cell(r,2,desc); b.font=Font(name=F,size=10); b.border=BORDER; b.fill=fill(PAL[pal][1])
    ws.row_dimensions[r].height=20; r+=1
r+=1
ws.cell(r,1,'Colour key').font=Font(name=F,size=12,bold=True,color=INK); r+=1
key=[('Coloured header',fill('BDD7EE'),'Column titles – please don\'t rename them (formulas and filters rely on them).'),
     ('White / striped cell',None,'Type your data here.'),
     ('Grey italic cell',AUTO_FILL,'Automatic formula – don\'t type over it.'),
     ('Soft yellow cell',INPUT,'A setting to fill once (exchange rates, bag limits, your city list).'),
     ('Booked / Paid / Done / Yes',fill('E2F0D9'),'Finished.'),
     ('Pending / In progress',fill('FFF2CC'),'Under way.'),
     ('To book / Not started',fill('FCE4D6'),'Still to do.'),
     ('Red tint',fill('F8D7DA'),'Needs attention: deadline within 7 days, over budget, bag over the limit, or "Must" priority.')]
for k,fl,d in key:
    a=ws.cell(r,1,k); a.font=Font(name=F,size=10); a.border=BORDER
    if fl: a.fill=fl
    b=ws.cell(r,2,d); b.font=Font(name=F,size=10); b.alignment=Alignment(wrap_text=True,vertical='center'); r+=1
r+=1
ws.cell(r,1,'How to use').font=Font(name=F,size=12,bold=True,color=INK); r+=1
tips=['Filter & sort: click the small arrow in any column header (e.g. City, District / ward, Neighbourhood, Category) and tick what you want to see.',
      'Dropdowns: cells with a list show an arrow when selected. To add or rename options, edit the "Lists" sheet – all dropdowns update.',
      'Cities: type your cities once in the yellow column of "Lists". They then appear as a dropdown on every sheet, so spelling stays consistent for filtering.',
      'More rows: just type in the first empty row under a table – it grows automatically and keeps the formatting and dropdowns.',
      'Planned day and time (Places / Food / Shopping): pick a trip date to put a wish-list item on that day of the Itinerary.',
      'Expenses: enter each cost in its own currency; fill the exchange rates once and totals convert to your home currency.',
      'Sharing on OneDrive: both of you can edit at the same time in Excel for the web or the desktop app with AutoSave on. Clear filters when done so the other person sees everything (or use Sheet View to filter privately).',
      'Dates: type as day/month/year, e.g. 08/04/2027. Times: 24-hour, e.g. 14:35.']
for t in tips:
    ws.cell(r,1,'•').alignment=Alignment(horizontal='right',vertical='top')
    c=ws.cell(r,2,t); c.font=Font(name=F,size=10); c.alignment=Alignment(wrap_text=True,vertical='top'); ws.row_dimensions[r].height=30; r+=1
ws.freeze_panes='A4'

wb.save('Japan_Trip_Planner_April_2027.xlsx')
print('saved',len(wb.sheetnames),wb.sheetnames)
