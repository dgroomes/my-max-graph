/**
 * WARNING: Unedited AI output.
 *
 * Starter diagram for `my-max-graph new` — the dogfood flow diagram.
 * Kept inline so the CLI bundle does not depend on gitignored `.local/` assets.
 */
const starterXml = `<GraphDataModel>
  <root>
    <Cell id="0">
      <Object as="style" />
    </Cell>
    <Cell id="1" parent="0">
      <Object as="style" />
    </Cell>
    <Cell id="2" value="You" vertex="1" parent="1">
      <Geometry _x="60" _y="250" _width="120" _height="60" as="geometry" />
      <Object shape="ellipse" fillColor="#f8cecc" strokeColor="#b85450" as="style" />
    </Cell>
    <Cell id="3" value="Browser view" vertex="1" parent="1">
      <Geometry _x="300" _y="100" _width="180" _height="64" as="geometry" />
      <Object rounded="1" fillColor="#dae8fc" strokeColor="#6c8ebf" as="style" />
    </Cell>
    <Cell id="4" value="Diagram XML file" vertex="1" parent="1">
      <Geometry _x="620" _y="250" _width="180" _height="64" as="geometry" />
      <Object rounded="1" fillColor="#d5e8d4" strokeColor="#82b366" as="style" />
    </Cell>
    <Cell id="5" value="Agent (terminal)" vertex="1" parent="1">
      <Geometry _x="300" _y="400" _width="180" _height="64" as="geometry" />
      <Object rounded="1" fillColor="#e1d5e7" strokeColor="#9673a6" as="style" />
    </Cell>
    <Cell id="6" value="Rendered image" vertex="1" parent="1">
      <Geometry _x="940" _y="400" _width="180" _height="64" as="geometry" />
      <Object rounded="1" fillColor="#fff2cc" strokeColor="#d6b656" as="style" />
    </Cell>
    <Cell id="7" value="look" edge="1" parent="1" source="2" target="3">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" rounded="1" strokeColor="#6c8ebf" as="style" />
    </Cell>
    <Cell id="8" value="make the middle box smaller" edge="1" parent="1" source="2" target="5">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" rounded="1" strokeColor="#9673a6" as="style" />
    </Cell>
    <Cell id="9" value="live sync" edge="1" parent="1" source="3" target="4">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" startArrow="block" rounded="1" strokeColor="#82b366" as="style" />
    </Cell>
    <Cell id="10" value="edit XML" edge="1" parent="1" source="5" target="4">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" rounded="1" strokeColor="#82b366" as="style" />
    </Cell>
    <Cell id="11" value="my-max-graph render" edge="1" parent="1" source="4" target="6">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" rounded="1" dashed="1" strokeColor="#d6b656" as="style" />
    </Cell>
    <Cell id="12" value="inspect (vision)" edge="1" parent="1" source="6" target="5">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" rounded="1" strokeColor="#9673a6" as="style" />
    </Cell>
  </root>
</GraphDataModel>
`;

export function starterDiagramXml() {
  return starterXml.endsWith('\n') ? starterXml : `${starterXml}\n`;
}
