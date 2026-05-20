import { WorkspaceService }
from "../../collab/workspace-service.js";

export class WorkspaceSync {

  constructor(app){

    this.app = app;

    this.timer = null;

  }

  start(){

    this.stop();

    this.timer =
      setInterval(
        ()=>this.sync(),
        1500
      );

  }

  stop(){

    if(this.timer){

      clearInterval(
        this.timer
      );

      this.timer = null;

    }

  }

  async sync(){

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

      const oldJson =
        JSON.stringify(
          this.app
          ?.state
          ?.workspaces
          ||[]
        );

      const newJson =
        JSON.stringify(
          rows||[]
        );

      if(
        oldJson===newJson
      )

      return;

      console.log(
        "[WORKSPACE SYNC]"
      );

      this.app.state.workspaces =
        rows;

      window.renderWorkspaces?.(
  this.app.state.workspaces
);

    }

    catch(err){

      console.error(
        "[WORKSPACE SYNC]",
        err
      );

    }

  }

}