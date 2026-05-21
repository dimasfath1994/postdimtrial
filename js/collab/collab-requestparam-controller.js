import {
RequestParamService
}
from
"./request-param-service.js";

export class CollabRequestParamController{

constructor({
tabs
}){

this.tabs=tabs;

this.init();

}


// ================= ACTIVE =================

getActiveRequest(){

if(
!this.tabs
)
return null;

return this.tabs.tabs.find(

t=>

t.id===
this.tabs.activeId

)

|| null;

}


// ================= LOAD =================

async load(){

const active=
this.getActiveRequest();

if(
!active
)
return;

const requestId=

Number(

active.requestId
||

active.id

);

if(
!requestId
)
return;

const rows=

await RequestParamService
.getByRequest(
requestId
);

active.params=

Array.isArray(
rows
)

? rows

: [];

console.log(
"[PARAMS LOADED]",
requestId,
active.params
);

this.renderParams();

}


// ================= RENDER =================

renderParams(){

const box=

document.getElementById(
"paramsBox"
);

if(
!box
)
return;

const active=
this.getActiveRequest();

if(
!active
)
return;

const params=

Array.isArray(
active.params
)

? active.params

: [];

box.innerHTML="";


// HEADER SELALU ADA

const header=

document.createElement(
"div"
);

header.className=
"param-row header";

header.innerHTML=`

<span></span>

<span>Key</span>

<span>Value</span>

<span>Description</span>

<span></span>

`;

box.appendChild(
header
);


// LOOP PARAMS

params.forEach(

param=>{

const row=

document.createElement(
"div"
);

row.className=
"param-row";

row.innerHTML=`

<input
type="checkbox"
class="en"
${
param.enabled
? "checked"
: ""
}
>

<input
class="k"
value="${
param.key||""
}">

<input
class="v"
value="${
param.value||""
}">

<input
class="d"

value="${
param.description
||
""
}"

placeholder=
"description"
>

<button>x</button>

`;

const enabled=
row.querySelector(
".en"
);

const key=
row.querySelector(
".k"
);

const value=
row.querySelector(
".v"
);

const desc=
row.querySelector(
".d"
);

const del=
row.querySelector(
"button"
);


enabled.onchange=
async e=>{

param.enabled=
e.target.checked;

await this.saveParam(
param
);

};


key.oninput=
async e=>{

param.key=
e.target.value;

await this.saveParam(
param
);

};


value.oninput=
async e=>{

param.value=
e.target.value;

await this.saveParam(
param
);

};


desc.oninput=
async e=>{

param.description=
e.target.value;

await this.saveParam(
param
);

};


del.onclick=
async()=>{

await RequestParamService
.delete(
param.id
);

const idx=

active.params.findIndex(

x=>

x.id===param.id

);

if(
idx>-1
){

active.params.splice(
idx,
1
);

}

row.remove();

};


box.appendChild(
row
);

}

);

}


// ================= SAVE =================

async saveParam(param){

const active=
this.getActiveRequest();

if(
!active
||
!param?.id
)
return;

await RequestParamService
.update(
param.id,
{

request_id:

Number(

active.requestId
||

active.id

),

key:
param.key||"",

value:
param.value||"",

description:

param.description
||"",

enabled:

Boolean(
param.enabled
)

}

);

}


// ================= ADD =================

async add(){

const active=
this.getActiveRequest();

if(
!active
)
return;

const requestId=

Number(

active.requestId
||

active.id

);

if(
!requestId
)
return;

const created=

await RequestParamService
.create({

request_id:
requestId,

key:"",

value:"",

description:"",

enabled:true

});

if(
!created
)
return;


if(
!Array.isArray(
active.params
)
){

active.params=[];

}


active.params.push(
created
);


// JANGAN LOAD ULANG
// BIAR GA HILANG

this.renderParams();

}


// ================= WATCH TAB =================

watchTabChange(){

window.addEventListener(

"tab-changed",

async()=>{

setTimeout(
async()=>{

await this.load();

},
50
);

}

);

}


// ================= INIT =================

bindAdd(){

document
.getElementById(
"addParam"
)

?.addEventListener(

"click",

()=>this.add()

);

}


init(){

this.bindAdd();

this.watchTabChange();


// FIX FIRST LOAD

window.addEventListener(

"workspace-loaded",

async()=>{

setTimeout(
async()=>{

await this.load();

},
300
);

}

);


// EXTRA SAFETY

setTimeout(
async()=>{

await this.load();

},
500
);

}

}