import {
 RequestParamService
}
from
"../../collab/request-param-service.js";

export class RequestParamSync{

constructor(
 tabsController
){

 this.tabsController=
 tabsController;

 this.timer=
 null;

}

start(){

 this.bind();

}

bind(){

 document.addEventListener(

 "input",

 e=>{

 const row=
 e.target.closest(
 ".param-row"
 );

 if(!row)
  return;

//  this.schedule(
//   row
//  );

 }

 );

}

// schedule(
//  row
// ){

//  clearTimeout(
//   this.timer
//  );

//  this.timer=

//  setTimeout(

//  ()=>this.save(
//  row
//  ),

//  300

//  );

// }

// async save(
//  row
// ){

//  const tab=

//  this.tabsController
//  ?.tabs
//  ?.getActive?.();

//  if(
//   !tab
//  )

//  return;

//  const payload={

//  request_id:
//  tab.requestId,

//  key:
//  row.querySelector(
//  ".param-key"
//  )
//  ?.value,

//  value:
//  row.querySelector(
//  ".param-value"
//  )
//  ?.value,

//  description:
//  row.querySelector(
//  ".param-desc"
//  )
//  ?.value,

//  enabled:
//  row.querySelector(
//  ".param-enabled"
//  )
//  ?.checked,

//  sort_order:
//  Number(
//  row.dataset.index
//  )
//  ||0

//  };

//  // create

//  if(
//  !row.dataset.id
//  ){

//  const r=

//  await RequestParamService
//  .create(
//  payload
//  );

//  row.dataset.id=
//  r.id;

//  return;

//  }

//  // update

//  await RequestParamService
//  .update(

//  row.dataset.id,

//  payload

//  );

// }

async remove(
 row
){

 const id=
 row.dataset.id;

 if(
  id
 ){

 await RequestParamService
 .delete(
  id
 );

 }

 row.remove();

}

}