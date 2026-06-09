import {
 Environment
}
from "../environment.js";


import {
 GlobalVariableService
}
from "../../collab/global-variable-service.js";

export class GlobalSync {

  constructor(
    state,
    render
  ){

    this.state=
      state;

    this.render=
      render;

    this.timer=
      null;

    this.lastHash=
      null;

  }

  start(){

    this.stop();

    this.timer=
      setInterval(

        ()=>this.sync(),

        1000

      );

  }

  stop(){

    clearInterval(
      this.timer
    );

  }

  async sync(){

    if(

      Date.now()

      -

      (
        window
        .__globalMutation

        ||0
      )

      <1500

    )

      return;

    const rows=

      await GlobalVariableService
      .getAll();

    const hash=
      JSON.stringify(
        rows
      );

    if(
      hash===
      this.lastHash
    )

      return;

    this.lastHash=
      hash;

    this.state.globals=
      rows;

    Environment.clear?.();

    rows.forEach(

      r=>{

      Environment.set(

        r.global_key,

        r.global_value
        ||""

      );

    });

    await this.render?.();

  }

}