param(
  [Parameter(Mandatory=$true)][string]$Request,
  [string]$SourceImage = '',
  [string]$ReferenceImage = '',
  [string]$MaskImage = ''
)

$type = 'txt2img'
if($SourceImage -and $MaskImage){ $type = 'inpainting' }
elseif($SourceImage -and $Request -match 'outpaint|expand canvas|extend'){ $type = 'outpainting' }
elseif($SourceImage){ $type = 'img2img' }

$identityNeeded = $false
if($ReferenceImage -or ($SourceImage -and $Request -match 'me|my face|my photo|portrait|keep face|identity')){ $identityNeeded = $true }

$primary = 'comfyui'
$secondary = 'invokeai'
$idMethod = ''
$risk = 'LOW'
if($identityNeeded){
  if($ReferenceImage){ $idMethod = 'instantid'; $risk = 'MEDIUM' }
  else { $idMethod = 'photomaker'; $risk = 'MEDIUM' }
}

$negative = 'deformed face, wrong identity, asymmetrical eyes, broken teeth, extra fingers, extra limbs, bad hands, warped background, oversmoothed skin, duplicate features, low detail'

$result = [ordered]@{
  WORKFLOW_TYPE = $type
  PRIMARY_TOOL = $primary
  SECONDARY_TOOL = $secondary
  REQUIRED_INPUTS = @{
    sourceImage = [bool]$SourceImage
    referenceImage = [bool]$ReferenceImage
    maskImage = [bool]$MaskImage
  }
  PROMPT = $Request
  NEGATIVE_PROMPT = $negative
  RISK_NOTES = if($identityNeeded){'Use conservative settings to reduce face drift.'} else {'No identity-sensitive subject detected.'}
  ID_METHOD_SELECTED = $idMethod
  IDENTITY_RISK_LEVEL = $risk
  RECOMMENDED_SETTINGS = if($identityNeeded){'Low denoise, strong identity conditioning, rerun if face drifts.'} else {'Standard settings.'}
  PASS_OR_RETRY = 'REVIEW_REQUIRED'
  NOTES = if($identityNeeded){'Identity preservation enabled.'} else {'Identity preservation not required.'}
}

$result | ConvertTo-Json -Depth 6
