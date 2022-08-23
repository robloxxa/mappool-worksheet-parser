exports.round_names = {
    q: /^qualifiers|^Q$/gi,
    ro: /^(?:round[ -_]?(?:of[ -_]?)?|RO[ -_]?)(?<round>[0-9]{2,})/gi,
    qf: /^(?:quarter[ -_]?finals|QF)/gi,
    sf: /^(?:semi[ -_]?finals|SF)/gi,
    f: /^finals/gi,
    gf: /^(?:grand[ -_]?finals|GF)/gi,
}

exports.mods = /^(?<mod>EZ|FL|NM|HD|HR|DT|NC|FM|SD|PF|TB)(?<num>[0-9]{0,2})?$/gi

exports.title = /^[A-Za-z0-9]* - [A-Za-z0-9]*$/gi
// exports.round_names = /(?<qualifiers>qualifiers)|(?<round_of>round (?:of )?(?<round>[0-9]{2,}))|(?<quarterfinals>quarter ?finals)|(?<semifinals> semi ?finals)|(?<finals>finals)|(?<grand_finals>grand ?finals)/i

