import { taskEither } from "fp-ts"
import { pipe } from "fp-ts/function"
import * as Nexus from "nexus"

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    const extension = ({ nexus }: { nexus: typeof Nexus }) => ({
      types: [
        nexus.mutationField("deleteComment", {
          type: "CommentEntityResponse",
          args: {
            id: nexus.nonNull(nexus.idArg()),
            data: nexus.inputObjectType({
              name: "DeleteCommentInput",
              definition: (t) => {
                t.nonNull.string("password")
              },
            }),
          },
          async resolve(parent, args) {
            const { toEntityResponse } = strapi.service(
              "plugin::graphql.format",
            ).returnTypes

            const data = await strapi.entityService.delete(
              "api::comment.comment",
              args.id,
            )

            return toEntityResponse(data)
          },
        }),
      ],
    })

    const extensionService = strapi
      .plugin("graphql")
      .service("extension")
      .use(extension)

    const getCommentMutationAllowed = async (context, args) => {
      if (context.state.user?.role?.name === "Admin") {
        return true
      }

      const { id, data: { password = null } = {} } = args

      return await pipe(
        password,
        taskEither.fromNullable(false),
        taskEither.chain((p) =>
          taskEither.tryCatch<boolean, boolean>(
            () =>
              strapi.entityService
                .findOne("api::comment.comment", id, {
                  fields: ["password"],
                })
                .then(({ password }) => password === p),
            () => false,
          ),
        ),
        taskEither.toUnion,
      )()
    }

    const commentMutationMiddleware = async (
      next,
      parent,
      args,
      context,
      info,
    ) => {
      if (await getCommentMutationAllowed(context, args)) {
        return await next(parent, args, context, info)
      }

      throw new Error("Not allowed")
    }

    extensionService.use({
      resolversConfig: {
        "Mutation.updateComment": {
          middlewares: [commentMutationMiddleware],
        },
        "Mutation.deleteComment": {
          middlewares: [commentMutationMiddleware],
        },
      },
    })
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/*{ strapi }*/) {},
}
