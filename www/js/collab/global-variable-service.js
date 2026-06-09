import { Auth } from "../auth.js";
import { API_BASE_URL }
from "../core/api/api-config.js";

const API =
  `${API_BASE_URL}/globals`;

export class GlobalVariableService {

  static headers(){

    return {

      "Content-Type":
        "application/json",

      Authorization:
        `Bearer ${Auth.getToken()}`

    };

  }

  static async getAll(){

    const res =
      await fetch(
        API,
        {
          headers:
            this.headers()
        }
      );

    return await res.json();

  }

  static async create(
    key,
    value=""
  ){

    window.__globalMutation =
      Date.now();

    const res =
      await fetch(

        API,

        {

          method:"POST",

          headers:
            this.headers(),

          body:
            JSON.stringify({

              global_key:key,

              global_value:value

            })

        }

      );

    return await res.json();

  }

  static async update(
    id,
    key,
    value
  ){

    window.__globalMutation =
      Date.now();

    const res =
      await fetch(

        `${API}/${id}`,

        {

          method:"PUT",

          headers:
            this.headers(),

          body:
            JSON.stringify({

              global_key:key,

              global_value:value

            })

        }

      );

    return await res.json();

  }

  static async delete(id){

    window.__globalMutation =
      Date.now();

    await fetch(

      `${API}/${id}`,

      {

        method:"DELETE",

        headers:
          this.headers()

      }

    );

  }

}