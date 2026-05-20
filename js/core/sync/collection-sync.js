import {
  CollectionService
}
from "../../collab/collection-service.js";

export class CollectionSync {

  constructor({

    state,

    tabsController

  }) {

    this.state =
      state;

    this.tabsController =
      tabsController;

    this.workspaceId =
      null;

    this.timer =
      null;

  }

  start(
    workspaceId
  ){

    this.workspaceId =
      workspaceId;

    this.stop();

    this.timer =
      setInterval(

        ()=>this.sync(),

        1500

      );

  }

  stop(){

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

      const filtered =
        rows.filter(
          x=>

          Number(
            x.workspace_id
          )

          ===

          Number(
            this.workspaceId
          )
        );

      const oldJson =
        JSON.stringify(

          this.state
          .collections
          ||[]

        );

      const newJson =
        JSON.stringify(
          filtered
        );

      if(
        oldJson === newJson
      )
        return;

      // console.log(
      //   "[COLLECTION SYNC]"
      // );

      const oldCollections =
        this.state
        .collections
        || [];

      // ===== ADD / UPDATE =====
      filtered.forEach(
        newCol=>{

        const old =
          oldCollections.find(
            x=>

            Number(x.id)

            ===

            Number(
              newCol.id
            )
          );

        if(!old){

          oldCollections.push(
            newCol
          );

          return;

        }

        old.name =
          newCol.name;

      });

      // ===== DELETE =====
      for(

        let i=
          oldCollections
          .length-1;

        i>=0;

        i--

      ){

        const exists =
          filtered.find(
            x=>

            Number(x.id)

            ===

            Number(
              oldCollections[i]
              .id
            )
          );

        if(!exists){

          oldCollections
          .splice(
            i,
            1
          );

        }

      }

      this.state
      .collections =
        oldCollections;

      this.tabsController
        .setCollections(
          oldCollections
        );

      //  NO renderCollections()
      // supaya expand collapse tetap hidup

    }
    catch(err){

      console.error(
        "[COLLECTION SYNC]",
        err
      );

    }

  }

}