const RAW_UI_MESSAGE =
  "Use @jam/ui components for puddy UI instead of raw HTML elements.";

const noRawUi = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw HTML VDOM in the puddy app UI.",
    },
    messages: {
      rawJsx: RAW_UI_MESSAGE,
      rawH: RAW_UI_MESSAGE,
      rawStyled: RAW_UI_MESSAGE,
    },
  },
  create(context) {
    const reportStringTag = (tag, messageId) => {
      const value =
        tag?.type === "Literal" || tag?.type === "StringLiteral"
          ? tag.value
          : undefined;

      if (typeof value !== "string" || !/^[a-z]/.test(value)) return;

      context.report({
        node: tag,
        messageId,
      });
    };

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name?.type !== "JSXIdentifier") return;
        if (!/^[a-z]/.test(name.name)) return;

        context.report({
          node,
          messageId: "rawJsx",
        });
      },
      CallExpression(node) {
        if (node.callee?.type !== "Identifier" || node.callee.name !== "h") {
          return;
        }

        const [tag] = node.arguments ?? [];
        reportStringTag(tag, "rawH");
      },
      "CallExpression[callee.name='styled']"(node) {
        const [tag] = node.arguments ?? [];
        reportStringTag(tag, "rawStyled");
      },
    };
  },
};

export default {
  meta: {
    name: "puddy",
  },
  rules: {
    "no-raw-ui": noRawUi,
  },
};
