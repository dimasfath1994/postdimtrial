import {
CollectionService
}
from
"../../collab/collection-service.js";

export class CollectionSync {

  constructor(
    app,
    workspaceId
  ){

    this.app =
      app;

    this.workspaceId =
      workspaceId;

    this.timer =
      null;

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

      this.timer =
        null;

    }

  }

  async sync(){

    try{

      if(
        !this.workspaceId
      )

      return;

      if(

        Date.now()

        -

        (
          window
          .__collectionMutation
          ||0
        )

        <1500

      )

      return;

      const rows =
        await CollectionService
        .getByWorkspace(
          Number(
            this.workspaceId
          )
        );

      const oldJson =
        JSON.stringify(
          this.app
          ?.state
          ?.collections
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
        "[COLLECTION SYNC]"
      );

      this.app.state.collections =
        rows;

      this.app
      .tabsController
      ?.setCollections(
        rows
      );

      this.app
      .tabsController
      ?.renderCollections(
        document
        .getElementById(
          "collectionList"
        )
      );

    }

    catch(err){

      console.error(
        "[COLLECTION SYNC]",
        err
      );

    }

  }

}