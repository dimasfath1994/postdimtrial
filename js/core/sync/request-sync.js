export class RequestSync {

  constructor(controller){

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

    }

  }

  async pull(){

    const activeCollectionId =
      this.controller.state
        .activeCollectionId;

    if(
      !activeCollectionId
    ) return;

    // ignore self update
    if(

      Date.now()
      -
      (
        this.controller
          .lastMutation
        || 0
      )

      < 1500

    ){

      return;

    }

    try{

      const col =
        await this.controller
          .loadCollection(
            activeCollectionId,
            true // sync mode
          );

      if(!col)
        return;

      const hash =
        JSON.stringify(
          col.tabs || []
        );

      if(
        hash
        ===
        this.lastHash
      ){

        return;

      }

      this.lastHash =
        hash;

      this.controller
        .tabs
        .render();

      this.controller
        .tabs
        .syncForm();

    }
    catch(err){

      console.error(
        "[REQUEST SYNC]",
        err
      );

    }

  }

}