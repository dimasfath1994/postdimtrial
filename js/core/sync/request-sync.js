export class RequestSync {

  constructor(controller){

    this.controller =
      controller;

    this.interval =
      null;

    this.lastHash =
      null;

    // lock local edit
    this.localEditingUntil =
      0;

    this.bindEditingGuard();

  }

  bindEditingGuard(){

    const ids = [

      "url",
      "body",
      "method"

    ];

    ids.forEach(id=>{

      const el =
        document.getElementById(
          id
        );

      if(!el)
        return;

      const markEditing = ()=>{

        this.localEditingUntil =
          Date.now()
          + 2000;

      };

      el.addEventListener(
        "input",
        markEditing
      );

      el.addEventListener(
        "keydown",
        markEditing
      );

      el.addEventListener(
        "change",
        markEditing
      );

    });

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

    // USER SEDANG NGETIK

    if(

      Date.now()

      <

      this.localEditingUntil

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

      // ================= SIDEBAR EXPAND STATE =================

      const expanded = {};

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

      // ================= UPDATE TABS =================

      const currentActive =

        this.controller
        .tabs
        .activeId;

      this.controller
      .tabs
      .tabs =

        structuredClone(

          col.tabs
          ||[]

        );

      this.controller
      .tabs
      .activeId =
        currentActive;

      this.controller
      .tabs
      .render();

      // sync form HANYA kalau user tidak fokus

      const focused =

        document.activeElement
        ?.id;

      const editing =

        [

          "url",

          "body",

          "method"

        ]

        .includes(
          focused
        );

      if(
        !editing
      ){

        this.controller
        .tabs
        .syncForm();

      }

      // ================= SIDEBAR =================

      this.controller
      .renderCollections(

        document
        .getElementById(
          "collectionList"
        )

      );

      // restore expand

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