#!/usr/bin/env python3
"""
Builds live test D: a QTI 2.1 content package with two items, to answer whether
Schoology's QTI 2.1 import accepts a matching question.

- item_choice.xml: a choiceInteraction (control, a type every importer supports)
- item_match.xml:  a matchInteraction (the question being tested)

    python3 tests/make_qti21_test.py OUT.zip

Imported in Schoology through Resources, Import, QTI v2.1. Untested.
"""
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = ('xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" '
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      'xsi:schemaLocation="http://www.imsglobal.org/xsd/imsqti_v2p1 http://www.imsglobal.org/xsd/qti/qtiv2p1/imsqti_v2p1.xsd"')

CHOICE = '''<?xml version="1.0" encoding="UTF-8"?>
<assessmentItem %s identifier="item_choice" title="Test D control: multiple choice" adaptive="false" timeDependent="false">
  <responseDeclaration identifier="RESPONSE" cardinality="single" baseType="identifier">
    <correctResponse><value>B</value></correctResponse>
  </responseDeclaration>
  <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float"/>
  <itemBody>
    <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="1">
      <prompt>A member that is being pulled apart is in:</prompt>
      <simpleChoice identifier="A">Compression</simpleChoice>
      <simpleChoice identifier="B">Tension</simpleChoice>
      <simpleChoice identifier="C">Torsion</simpleChoice>
    </choiceInteraction>
  </itemBody>
  <responseProcessing template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct"/>
</assessmentItem>
''' % NS

MATCH = '''<?xml version="1.0" encoding="UTF-8"?>
<assessmentItem %s identifier="item_match" title="Test D: matching" adaptive="false" timeDependent="false">
  <responseDeclaration identifier="RESPONSE" cardinality="multiple" baseType="directedPair">
    <correctResponse>
      <value>T1 D1</value>
      <value>T2 D2</value>
      <value>T3 D3</value>
    </correctResponse>
    <mapping defaultValue="0">
      <mapEntry mapKey="T1 D1" mappedValue="1"/>
      <mapEntry mapKey="T2 D2" mappedValue="1"/>
      <mapEntry mapKey="T3 D3" mappedValue="1"/>
    </mapping>
  </responseDeclaration>
  <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float"/>
  <itemBody>
    <matchInteraction responseIdentifier="RESPONSE" shuffle="false" maxAssociations="3">
      <prompt>Match each term to its meaning.</prompt>
      <simpleMatchSet>
        <simpleAssociableChoice identifier="T1" matchMax="1">Tension</simpleAssociableChoice>
        <simpleAssociableChoice identifier="T2" matchMax="1">Compression</simpleAssociableChoice>
        <simpleAssociableChoice identifier="T3" matchMax="1">Shear</simpleAssociableChoice>
      </simpleMatchSet>
      <simpleMatchSet>
        <simpleAssociableChoice identifier="D1" matchMax="1">Pulling apart</simpleAssociableChoice>
        <simpleAssociableChoice identifier="D2" matchMax="1">Pushing together</simpleAssociableChoice>
        <simpleAssociableChoice identifier="D3" matchMax="1">Sliding past</simpleAssociableChoice>
      </simpleMatchSet>
    </matchInteraction>
  </itemBody>
  <responseProcessing template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/map_response"/>
</assessmentItem>
''' % NS

MANIFEST = '''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test_d_qti21" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p4.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1</schemaversion>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="res_item_choice" type="imsqti_item_xmlv2p1" href="item_choice.xml">
      <file href="item_choice.xml"/>
    </resource>
    <resource identifier="res_item_match" type="imsqti_item_xmlv2p1" href="item_match.xml">
      <file href="item_match.xml"/>
    </resource>
  </resources>
</manifest>
'''


def main(out):
    for name, text in (('imsmanifest.xml', MANIFEST), ('item_choice.xml', CHOICE), ('item_match.xml', MATCH)):
        ET.fromstring(text.encode('utf-8'))  # every file must be well-formed
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('imsmanifest.xml', MANIFEST)
        z.writestr('item_choice.xml', CHOICE)
        z.writestr('item_match.xml', MATCH)
    print('Wrote ' + out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'Test_D_qti21_matching.zip')
