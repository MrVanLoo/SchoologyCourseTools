#!/usr/bin/env python3
"""
Builds a synthetic Schoology-style export with every problem `cc_review.js audit`
must report (acceptance test 9), plus a few extra ones:

- an empty resource directory under a video title (dropped embed)
- a duplicate resource identifier
- an absolute href
- an assignment with no points input
- two same-titled items in one folder
- an empty folder
- extras: an assignment at 100 points, an empty description, a malformed link URL, an <img> in a page

    python3 tests/make_fake_export.py OUT.imscc
"""
import sys
import zipfile

MANIFEST = '''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="sgy_fake" xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p2/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.2.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Fake Schoology Export</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
        <item identifier="f1">
          <title>Unit 1: Energy</title>
          <item identifier="f2">
            <title>Lesson 1.1</title>
            <item identifier="i1" identifierref="ccres0000001"><title>Activity 1.1.1 No Points</title></item>
            <item identifier="i2" identifierref="ccres0000002"><title>Activity 1.1.2 Lab</title></item>
            <item identifier="i3" identifierref="ccres0000003"><title>Notes</title></item>
            <item identifier="i4" identifierref="ccres0000004"><title>Notes</title></item>
            <item identifier="i5" identifierref="ccres0000005"><title>Energy transfer video</title></item>
            <item identifier="i6" identifierref="ccres0000006"><title>Handout</title></item>
            <item identifier="i7" identifierref="ccres0000007"><title>Big project</title></item>
            <item identifier="i8" identifierref="ccres0000008"><title>Blank page</title></item>
            <item identifier="i9" identifierref="ccres0000009"><title>Broken link</title></item>
            <item identifier="i10" identifierref="ccres0000010"><title>Diagram page</title></item>
          </item>
          <item identifier="f3">
            <title>Lesson 1.2 (empty)</title>
          </item>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="ccres0000001" type="webcontent" href="ccres0000001/assignment.html" intendeduse="assignment">
      <metadata/>
      <file href="ccres0000001/assignment.html"/>
    </resource>
    <resource identifier="ccres0000002" type="webcontent" href="ccres0000002/assignment.html" intendeduse="assignment">
      <metadata/>
      <file href="ccres0000002/assignment.html"/>
    </resource>
    <resource identifier="ccres0000002" type="webcontent" href="ccres0000002/assignment.html" intendeduse="assignment">
      <metadata/>
      <file href="ccres0000002/assignment.html"/>
    </resource>
    <resource identifier="ccres0000003" type="webcontent" href="ccres0000003/page.html">
      <file href="ccres0000003/page.html"/>
    </resource>
    <resource identifier="ccres0000004" type="webcontent" href="ccres0000004/page.html">
      <file href="ccres0000004/page.html"/>
    </resource>
    <resource identifier="ccres0000005" type="webcontent" href="ccres0000005/">
    </resource>
    <resource identifier="ccres0000006" type="webcontent" href="/var/www/html/sgy_pkg/abc123/handout.pdf">
      <file href="/var/www/html/sgy_pkg/abc123/handout.pdf"/>
    </resource>
    <resource identifier="ccres0000007" type="webcontent" href="ccres0000007/assignment.html" intendeduse="assignment">
      <metadata/>
      <file href="ccres0000007/assignment.html"/>
    </resource>
    <resource identifier="ccres0000008" type="webcontent" href="ccres0000008/page.html">
      <file href="ccres0000008/page.html"/>
    </resource>
    <resource identifier="ccres0000009" type="imswl_xmlv1p2">
      <file href="ccres0000009/weblink.xml"/>
    </resource>
    <resource identifier="ccres0000010" type="webcontent" href="ccres0000010/page.html">
      <file href="ccres0000010/page.html"/>
    </resource>
  </resources>
</manifest>
'''

FILES = {
    'ccres0000001/assignment.html': '<p>Answer the questions on the energy worksheet.</p>',
    'ccres0000002/assignment.html': '<p>Write up the lab.</p><input name="sch-grade-item-max-points" type="hidden" value="15">',
    'ccres0000003/page.html': '<p>First set of notes.</p>',
    'ccres0000004/page.html': '<p>Second set of notes, same title.</p>',
    'ccres0000007/assignment.html': '<p>Final project.</p><input name="sch-grade-item-max-points" type="hidden" value="100">',
    'ccres0000008/page.html': '<p> </p>',
    'ccres0000009/weblink.xml': '<?xml version="1.0" encoding="UTF-8"?><webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imswl_v1p2"><title>Broken link</title><url href="htp//example com/bad"/></webLink>',
    'ccres0000010/page.html': '<p>Look at this:</p><p><img src="$IMS-CC-FILEBASE$../resources/diagram.png" alt="diagram"></p>',
}


def main(out):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('imsmanifest.xml', MANIFEST)
        for k, v in FILES.items():
            z.writestr(k, v)
        z.writestr(zipfile.ZipInfo('ccres0000005/'), '')  # empty directory: the dropped video
    print('Wrote ' + out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'fake_schoology_export.imscc')
