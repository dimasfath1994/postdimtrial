export class RequestSync {

  constructor(
    controller
  ){

    this.controller =
      controller;

    this.interval =
      null;

    this.lastHash =
      null;

  }

  start(){

    this.stop();

    this.interval =
      setInterval(

        ()=>this.pull(),

        1000

      );

  }

  stop(){

    if(
      this.interval
    ){

      clearInterval(
        this.interval
      );

      this.interval =
        null;

    }

  }

  async pull(){

    const activeCollectionId =

      this.controller
      .state
      .activeCollectionId;

    if(
      !activeCollectionId
    )
      return;

    // ignore local mutation
    if(

      Date.now()

      -

      (
        this.controller
        .lastMutation
        ||0
      )

      <1500

    ){

      return;

    }

    try{

      const col =

        await this.controller
        .loadCollection(

          activeCollectionId,

          true

        );

      if(
        !col
      )
        return;

      const hash =

        JSON.stringify(
          col.tabs || []
        );

      if(
        hash ===
        this.lastHash
      ){

        return;

      }

      this.lastHash =
        hash;

      // ================= UPDATE ACTIVE COLLECTION =================

      const activeCollection =

        this.controller
        .state
        .collections
        ?.find(

          c=>

          Number(c.id)

          ===

          Number(
            activeCollectionId
          )

        );

      if(
        activeCollection
      ){

        activeCollection.tabs =

          structuredClone(

            col.tabs
            ||[]

          );

      }

      // ================= UPDATE TAB MIDDLE =================

      this.controller
      .tabs
      .tabs =

        structuredClone(

          col.tabs
          ||[]

        );

      this.controller
      .tabs
      .render();

      this.controller
      .tabs
      .syncForm();

      // ================= PRESERVE SIDEBAR EXPAND =================

      const expanded={};

      document
      .querySelectorAll(
        ".collection-item"
      )
      .forEach(el=>{

        expanded[
          el.dataset.id
        ]=

        el.classList
        .contains(
          "expanded"
        );

      });

      // ================= REFRESH SIDEBAR =================

      this.controller
      .renderCollections(

        document
        .getElementById(
          "collectionList"
        )

      );

      // ================= RESTORE EXPAND =================

      Object.entries(
        expanded
      )
      .forEach(

        ([id,val])=>{

        if(!val)
          return;

        document
        .querySelector(

          `.collection-item[data-id="${id}"]`

        )
        ?.classList
        .add(
          "expanded"
        );

      });

    }
    catch(err){

      console.error(

        "[REQUEST SYNC]",

        err

      );

    }

  }

}