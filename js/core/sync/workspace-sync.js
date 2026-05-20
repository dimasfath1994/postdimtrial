import {
  WorkspaceService
}
from "../../collab/workspace-service.js";

export class WorkspaceSync {

  constructor({

    state,

    renderWorkspaces

  }) {

    this.state =
      state;

    this.renderWorkspaces =
      renderWorkspaces;

    this.timer =
      null;

  }

  start() {

    this.stop();

    this.timer =
      setInterval(

        ()=>this.sync(),

        1500

      );

  }

  stop() {

    if(
      this.timer
    ){

      clearInterval(
        this.timer
      );

      this.timer =
        null;

    }

  }

  async sync() {

    try{

      if(

        Date.now()

        -

        (
          window
          .__workspaceMutation
          ||0
        )

        <1500

      )
        return;

      const rows =
        await WorkspaceService
          .getMyWorkspaces();

      const oldList =
        this.state
        .workspaceList
        || [];

      const oldJson =
        JSON.stringify(
          oldList
        );

      const newJson =
        JSON.stringify(
          rows
        );

      if(
        oldJson === newJson
      )
        return;

      console.log(
        "[WORKSPACE SYNC]"
      );

      // ===== ADD / UPDATE =====
      rows.forEach(newWs=>{

        const old =
          oldList.find(
            x=>

            Number(x.id)

            ===

            Number(
              newWs.id
            )
          );

        if(!old){

          oldList.push(
            newWs
          );

          return;

        }

        old.name =
          newWs.name;

      });

      // ===== DELETE =====
      for(

        let i=
          oldList.length-1;

        i>=0;

        i--

      ){

        const exists =
          rows.find(
            x=>

            Number(x.id)

            ===

            Number(
              oldList[i].id
            )
          );

        if(!exists){

          oldList.splice(
            i,
            1
          );

        }

      }

      this.state
      .workspaceList =
        oldList;

      await this
        .renderWorkspaces
        ?.();

    }
    catch(err){

      console.error(
        "[WORKSPACE SYNC]",
        err
      );

    }

  }

}